import { randomUUID } from 'node:crypto'
import { PrismaClient, type User } from '@prisma/client'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { encode } from 'next-auth/jwt'
import { prisma } from '@/lib/prisma'
import { createAthlete, createAthleteSchema } from '@/lib/athlete-profiles'
import { BookingCreationError, createBooking } from '@/lib/booking-creation'
import { GET, POST } from '@/app/api/athletes/route'
import { PATCH, DELETE } from '@/app/api/athletes/[id]/route'

const independent = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL })
const secret = 'athlete-profile-disposable-tests-only'
const users: string[] = [], sports: string[] = []
let parent: User, other: User, sport: { id: string; slug: string }, verified = false
async function user(role: 'PARENT' | 'TRAINER' | 'ADMIN' = 'PARENT') {
  const id = randomUUID()
  const record = await prisma.user.create({ data: { email: `athlete-${id}@example.test`, role, passwordHash: 'not-a-login',
    ...(role === 'PARENT' ? { parentProfile: { create: {} } } : {}),
    ...(role === 'TRAINER' ? { trainerProfile: { create: { firstName: 'Synthetic', lastName: 'Trainer', slug: id, approvalStatus: 'APPROVED' } } } : {}) } })
  users.push(record.id)
  return record
}
function data() { return { requestId: randomUUID(), firstName: ' Synthetic ', lastName: ' Athlete ', dateOfBirth: '2016-02-29', sports: [sport.id], goals: [' Confidence '], notes: ' Private parent note ' } }
async function request(actor: User | null, method: string, body?: unknown) {
  const token = actor ? await encode({ secret, token: { sub: actor.id, role: actor.role, sessionVersion: actor.sessionVersion } }) : ''
  return new NextRequest('http://localhost/api/athletes', { method, headers: { cookie: `next-auth.session-token=${token}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
}
async function create(input = data(), actor = parent) {
  const response = await POST(await request(actor, 'POST', input))
  expect(response.status).toBe(201)
  return response.json()
}
function editable(athlete: any) {
  return { firstName: athlete.firstName, lastName: athlete.lastName, dateOfBirth: athlete.dateOfBirth.slice(0, 10), gender: athlete.gender || 'PREFER_NOT_TO_SAY',
    skillLevel: athlete.skillLevel, goals: athlete.goals, notes: athlete.notes || '', sports: athlete.sports.map((item: any) => item.sport.id), revision: athlete.updatedAt }
}
async function patch(id: string, input: unknown, actor = parent) { return PATCH(await request(actor, 'PATCH', input), { params: Promise.resolve({ id }) }) }
async function remove(id: string, revision: string, actor = parent) { return DELETE(await request(actor, 'DELETE', { revision }), { params: Promise.resolve({ id }) }) }
async function reservable() {
  const trainer = await user('TRAINER')
  const profile = await prisma.trainerProfile.findUniqueOrThrow({ where: { userId: trainer.id } })
  await prisma.trainerSport.create({ data: { trainerProfileId: profile.id, sportId: sport.id } })
  await prisma.availabilitySlot.create({ data: { trainerProfileId: profile.id, dayOfWeek: 1, startTime: '09:00', endTime: '17:00' } })
  return prisma.serviceOffering.create({ data: { trainerProfileId: profile.id, sportId: sport.id, title: 'Synthetic session', durationMinutes: 60, priceInCents: 6000 } })
}
beforeAll(async () => {
  expect(await prisma.$queryRaw`SELECT current_database() AS name, purpose FROM trainr_test_guard`).toEqual([{ name: 'trainr_audit_20261008', purpose: 'disposable integration database' }])
  verified = true
  vi.stubEnv('NEXTAUTH_SECRET', secret)
})
beforeEach(async () => {
  parent = await user(); other = await user()
  const id = randomUUID()
  sport = await prisma.sport.create({ data: { name: `Synthetic ${id}`, slug: `sport-${id}` } })
  sports.push(sport.id)
})
afterEach(async () => {
  if (!verified) return
  await prisma.booking.deleteMany({ where: { parentProfile: { userId: { in: users } } } })
  await prisma.user.deleteMany({ where: { id: { in: users } } })
  await prisma.sport.deleteMany({ where: { id: { in: sports } } })
  users.length = 0; sports.length = 0
})
afterAll(async () => { await prisma.$disconnect(); await independent.$disconnect(); vi.unstubAllEnvs() })

it('persists normalized details and active sport links without exposing request hashes or account fields', async () => {
  const saved = await create({ ...data(), sports: [sport.slug] })
  expect(saved).toMatchObject({ firstName: 'Synthetic', lastName: 'Athlete', dateOfBirth: '2016-02-29T00:00:00.000Z', goals: ['Confidence'], notes: 'Private parent note' })
  expect(saved.sports[0].sport.id).toBe(sport.id)
  const stored = await independent.athleteProfile.findUniqueOrThrow({ where: { id: saved.id } })
  expect(stored.firstName).toBe('Synthetic')
  const response = await GET(await request(parent, 'GET'))
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  const body = await response.json()
  expect(body.catalog.map((item: any) => item.id)).toContain(sport.id)
  expect(body.athletes.map((item: any) => item.id)).toEqual([saved.id])
  expect(JSON.stringify(body)).not.toMatch(/payloadHash|passwordHash|parentProfileId|requestId/)
})
it('creates exactly one profile for concurrent identical save requests', async () => {
  const input = data()
  const results = await Promise.all([POST(await request(parent, 'POST', input)), POST(await request(parent, 'POST', input))])
  expect(results.map(result => result.status).sort()).toEqual([200, 201])
  expect((await results[0].json()).id).toBe((await results[1].json()).id)
  expect(await prisma.athleteProfile.count()).toBe(1)
  expect(await prisma.athleteCreateRequest.count()).toBe(1)
})
it('rejects changed payload replay but allows a separate parent to use the same request key', async () => {
  const input = data(), saved = await create(input)
  expect((await POST(await request(parent, 'POST', { ...input, firstName: 'Changed' }))).status).toBe(409)
  const theirs = await create(input, other)
  expect(theirs.id).not.toBe(saved.id)
  expect((await (await GET(await request(parent, 'GET'))).json()).athletes.map((item: any) => item.id)).toEqual([saved.id])
})
it.each([null, 'TRAINER', 'ADMIN'])('denies non-parent access: %s', async role => {
  const actor = role ? await user(role as 'TRAINER' | 'ADMIN') : null
  const code = actor ? 403 : 401
  expect((await GET(await request(actor, 'GET'))).status).toBe(code)
  expect((await POST(await request(actor, 'POST', data()))).status).toBe(code)
  expect((await PATCH(await request(actor, 'PATCH', {}), { params: Promise.resolve({ id: 'other' }) })).status).toBe(code)
  expect((await DELETE(await request(actor, 'DELETE', {}), { params: Promise.resolve({ id: 'other' }) })).status).toBe(code)
})
it('does not disclose or change another parents athlete', async () => {
  const saved = await create()
  expect((await patch(saved.id, { ...editable(saved), notes: 'intrusion' }, other)).status).toBe(404)
  expect((await remove(saved.id, saved.updatedAt, other)).status).toBe(404)
  expect((await (await GET(await request(other, 'GET'))).json()).athletes).toEqual([])
  expect((await independent.athleteProfile.findUniqueOrThrow({ where: { id: saved.id } })).notes).toBe('Private parent note')
})
it.each(['unknown', 'inactive', 'alias-duplicate', 'ambiguous'])('rejects every unavailable or ambiguous sport without partial writes: %s', async kind => {
  let selections = [sport.id, 'unknown']
  if (kind === 'inactive') { await prisma.sport.update({ where: { id: sport.id }, data: { isActive: false } }); selections = [sport.id] }
  if (kind === 'alias-duplicate') selections = [sport.id, sport.slug]
  if (kind === 'ambiguous') {
    const collision = await prisma.sport.create({ data: { name: randomUUID(), slug: sport.id } }); sports.push(collision.id); selections = [sport.id]
  }
  expect((await POST(await request(parent, 'POST', { ...data(), sports: selections }))).status).toBe(400)
  expect(await prisma.athleteProfile.count()).toBe(0)
  expect(await prisma.athleteCreateRequest.count()).toBe(0)
})
it('serializes stale concurrent edits and preserves profile identity and sports', async () => {
  const saved = await create()
  const responses = await Promise.all([patch(saved.id, { ...editable(saved), firstName: 'First' }), patch(saved.id, { ...editable(saved), firstName: 'Second' })])
  expect(responses.map(result => result.status).sort()).toEqual([200, 409])
  const stored = await independent.athleteProfile.findUniqueOrThrow({ where: { id: saved.id }, include: { sports: true } })
  expect(stored.updatedAt.toISOString()).not.toBe(saved.updatedAt)
  expect(stored.sports).toHaveLength(1)
  expect(['First', 'Second']).toContain(stored.firstName)
  expect((await remove(saved.id, saved.updatedAt)).status).toBe(409)
})
it('replays the current saved profile without overwriting a later edit', async () => {
  const input = data(), saved = await create(input)
  expect((await patch(saved.id, { ...editable(saved), firstName: 'Edited' })).status).toBe(200)
  const response = await POST(await request(parent, 'POST', input))
  expect(response.status).toBe(200)
  expect((await response.json()).firstName).toBe('Edited')
})
it('deletes an unbooked profile but retains a tombstone against delayed create replay', async () => {
  const input = data(), saved = await create(input)
  expect((await remove(saved.id, saved.updatedAt)).status).toBe(200)
  expect(await independent.athleteProfile.findUnique({ where: { id: saved.id } })).toBeNull()
  expect(await prisma.athleteSport.count()).toBe(0)
  expect((await prisma.athleteCreateRequest.findFirstOrThrow()).athleteProfileId).toBeNull()
  expect((await POST(await request(parent, 'POST', input))).status).toBe(409)
  expect(await prisma.athleteProfile.count()).toBe(0)
})
it('books using a saved profile and preserves booking history when deletion is requested', async () => {
  const saved = await create(), service = await reservable()
  const booking = await createBooking(parent.id, { requestId: randomUUID(), athleteProfileId: saved.id, serviceOfferingId: service.id, date: '2030-11-04', startTime: '09:00' })
  expect(booking.athleteProfileId).toBe(saved.id)
  expect((await remove(saved.id, saved.updatedAt)).status).toBe(409)
  expect(await independent.booking.findUnique({ where: { id: booking.id } })).not.toBeNull()
})
it.each(Array.from({ length: 10 }, (_, index) => index))('serializes booking versus profile deletion without database errors: %s', async () => {
  const saved = await create(), service = await reservable()
  const [booked, deleted] = await Promise.all([
    createBooking(parent.id, { requestId: randomUUID(), athleteProfileId: saved.id, serviceOfferingId: service.id, date: '2030-11-04', startTime: '09:00' }).then(() => true, error => {
      expect(error).toBeInstanceOf(BookingCreationError)
      expect(error).toMatchObject({ status: 404, message: 'Athlete not found' })
      return false
    }),
    remove(saved.id, saved.updatedAt).then(response => {
      expect([200, 409]).toContain(response.status)
      return response.status === 200
    }),
  ])
  expect(Number(booked) + Number(deleted)).toBe(1)
  expect(await prisma.booking.count()).toBe(booked ? 1 : 0)
  expect(await prisma.athleteProfile.count()).toBe(booked ? 1 : 0)
})
it('rechecks role and deactivation inside the transaction and rejects the old cookie', async () => {
  const input = createAthleteSchema.parse(data()), cookie = await request(parent, 'GET')
  await prisma.user.update({ where: { id: parent.id }, data: { deletedAt: new Date(), sessionVersion: { increment: 1 } } })
  expect((await GET(cookie)).status).toBe(401)
  await expect(createAthlete(parent.id, input)).rejects.toMatchObject({ status: 403 })
  expect(await prisma.athleteProfile.count()).toBe(0)
})
it('rolls profile creation back if the request ledger write fails, then retries cleanly', async () => {
  const input = data()
  await prisma.$executeRawUnsafe('ALTER TABLE athlete_create_requests ADD CONSTRAINT athlete_request_test_failure CHECK (false) NOT VALID')
  try {
    expect((await POST(await request(parent, 'POST', input))).status).toBe(503)
    expect(await prisma.athleteProfile.count()).toBe(0)
    expect(await prisma.athleteCreateRequest.count()).toBe(0)
  } finally { await prisma.$executeRawUnsafe('ALTER TABLE athlete_create_requests DROP CONSTRAINT athlete_request_test_failure') }
  await create(input)
  expect(await prisma.athleteProfile.count()).toBe(1)
})
it('rolls sport replacement back if the later profile update fails', async () => {
  const saved = await create()
  await prisma.$executeRawUnsafe("ALTER TABLE athlete_profiles ADD CONSTRAINT athlete_update_test_failure CHECK (notes <> 'rollback-test') NOT VALID")
  try {
    expect((await patch(saved.id, { ...editable(saved), notes: 'rollback-test' })).status).toBe(503)
    const stored = await independent.athleteProfile.findUniqueOrThrow({ where: { id: saved.id }, include: { sports: true } })
    expect(stored.sports).toHaveLength(1)
    expect(stored.notes).toBe('Private parent note')
    expect(stored.updatedAt.toISOString()).toBe(saved.updatedAt)
  } finally { await prisma.$executeRawUnsafe('ALTER TABLE athlete_profiles DROP CONSTRAINT athlete_update_test_failure') }
})
