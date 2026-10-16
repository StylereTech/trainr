import { createHash, randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { beforeAll, beforeEach, afterEach, afterAll, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { encode } from 'next-auth/jwt'
import { prisma } from '@/lib/prisma'
import { createBooking } from '@/lib/booking-creation'
import { POST } from '@/app/api/bookings/route'
import { POST as QUOTE } from '@/app/api/bookings/quote/route'
import { bookingSchema } from '@/lib/validations'

const independent = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL })
const secret = 'local-booking-request-test-only'
let parent: string, trainer: string, sport: string, athlete: string, service: string, coupon: string
let guarded = false
const userIds: string[] = []

beforeAll(async () => {
  const rows = await prisma.$queryRaw<Array<{ name: string; purpose: string }>>`SELECT current_database() AS name, purpose FROM trainr_test_guard`
  expect(rows).toHaveLength(1)
  expect(rows[0].name).toMatch(/^trainr_audit_/)
  expect(rows[0].purpose).toBe('disposable integration database')
  guarded = true
  vi.stubEnv('NEXTAUTH_SECRET', secret)
})
beforeEach(async () => {
  coupon = ''
  const id = randomUUID()
  sport = (await prisma.sport.create({ data: { name: id, slug: id } })).id
  const parentUser = await prisma.user.create({ data: { email: `reservation-${id}@example.test`, role: 'PARENT', passwordHash: 'not-a-login',
    parentProfile: { create: { athletes: { create: { firstName: 'Synthetic', lastName: 'Athlete', dateOfBirth: new Date('2015-01-01'), goals: [], sports: { create: { sportId: sport } } } } } } },
    include: { parentProfile: { include: { athletes: true } } } })
  parent = parentUser.id; athlete = parentUser.parentProfile!.athletes[0].id; userIds.push(parent)
  const trainerUser = await prisma.user.create({ data: { email: `reservation-trainer-${id}@example.test`, role: 'TRAINER', passwordHash: 'not-a-login',
    trainerProfile: { create: { firstName: 'Synthetic', lastName: 'Trainer', slug: id, timeZone: 'UTC', approvalStatus: 'APPROVED', stripeAccountId: 'acct_synthetic', stripeOnboardingComplete: true, sports: { create: { sportId: sport } },
      serviceOfferings: { create: { title: 'Synthetic session', priceInCents: 6000, durationMinutes: 60, sportId: sport } },
      availabilitySlots: { create: { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' } } } } }, include: { trainerProfile: { include: { serviceOfferings: true } } } })
  trainer = trainerUser.id; userIds.push(trainer)
  service = trainerUser.trainerProfile!.serviceOfferings[0].id
  coupon = (await prisma.coupon.create({ data: { code: id.replaceAll('-', '').toUpperCase(), discountPercent: 10, maxUses: 10, createdById: trainer } })).id
})
afterEach(async () => {
  if (!guarded) return
  await prisma.booking.deleteMany({ where: { parentProfile: { userId: { in: userIds } } } })
  await prisma.user.deleteMany({ where: { id: { in: userIds } } })
  if (coupon) await prisma.coupon.deleteMany({ where: { id: coupon } })
  await prisma.sport.deleteMany({ where: { id: sport } })
  userIds.length = 0
})
afterAll(async () => { await prisma.$disconnect(); await independent.$disconnect(); vi.unstubAllEnvs() })

async function input() {
  const offer = await prisma.coupon.findUniqueOrThrow({ where: { id: coupon } })
  return { requestId: randomUUID(), serviceOfferingId: service, athleteProfileId: athlete, date: '2030-11-04', startTime: '09:00', timeZone: 'UTC', notes: 'Synthetic note',
    expectedTotalInCents: 6000 - Math.round(6000 * offer.discountPercent! / 100), couponCode: offer.code }
}
async function post(body: unknown, userId = parent, handler: (req: NextRequest) => Promise<Response> = POST) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  const token = await encode({ secret, token: { sub: user.id, role: user.role, sessionVersion: user.sessionVersion } })
  return handler(new NextRequest('http://localhost/api/bookings', { method: 'POST', headers: { 'content-type': 'application/json', cookie: `next-auth.session-token=${token}` }, body: JSON.stringify(body) }))
}

it('quotes repeatedly without consuming coupons or reserving, then rejects a changed service price until reviewed', async () => {
  const body = await input()
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await post({ serviceOfferingId: service, couponCode: body.couponCode }, parent, QUOTE)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ subtotalInCents: 6000, discountInCents: 600, totalAmountInCents: 5400 })
  }
  expect(await independent.booking.count()).toBe(0)
  expect((await independent.coupon.findUniqueOrThrow({ where: { id: coupon } })).currentUses).toBe(0)
  await prisma.serviceOffering.update({ where: { id: service }, data: { priceInCents: 7000 } })
  const changed = await post(body)
  expect(changed.status).toBe(409)
  expect(await changed.json()).toMatchObject({ code: 'PRICE_CHANGED' })
  expect(await independent.booking.count()).toBe(0)
  expect(await independent.notification.count()).toBe(0)
  expect(await independent.bookingCreateRequest.count()).toBe(0)
  expect((await independent.coupon.findUniqueOrThrow({ where: { id: coupon } })).currentUses).toBe(0)
  const reviewed = await (await post({ serviceOfferingId: service, couponCode: body.couponCode }, parent, QUOTE)).json()
  expect(reviewed.totalAmountInCents).toBe(6300)
  expect((await post({ ...body, expectedTotalInCents: reviewed.totalAmountInCents })).status).toBe(201)
  expect((await independent.booking.findFirstOrThrow()).totalAmountInCents).toBe(6300)
})
it.each(['expired', 'exhausted', 'discount-changed'])('revalidates coupon %s after quoting without a silent full-price reservation', async change => {
  const body = await input()
  expect((await post({ serviceOfferingId: service, couponCode: body.couponCode }, parent, QUOTE)).status).toBe(200)
  await prisma.coupon.update({ where: { id: coupon }, data: change === 'expired' ? { expiresAt: new Date(0) } : change === 'exhausted' ? { maxUses: 0 } : { discountPercent: 5 } })
  expect((await post(body)).status).toBe(change === 'discount-changed' ? 409 : 400)
  expect(await independent.booking.count()).toBe(0)
  expect(await independent.bookingCreateRequest.count()).toBe(0)
  expect((await independent.coupon.findUniqueOrThrow({ where: { id: coupon } })).currentUses).toBe(0)
})
it('rejects an unconfirmed new price but preserves exact replay of legacy committed requests', async () => {
  const current = await input()
  const { expectedTotalInCents: _price, ...legacy } = current
  expect((await post(legacy)).status).toBe(409)
  expect(await independent.booking.count()).toBe(0)
  const saved = await (await post(current)).json()
  // Model a ledger committed before the accepted-price field existed.
  const { requestId: _request, ...legacyPayload } = bookingSchema.parse(legacy)
  const ledger = await independent.bookingCreateRequest.findFirstOrThrow()
  await prisma.bookingCreateRequest.update({ where: { parentProfileId_requestId: { parentProfileId: ledger.parentProfileId, requestId: ledger.requestId } }, data: { payloadHash: createHash('sha256').update(JSON.stringify(legacyPayload)).digest('hex') } })
  const response = await post(legacy)
  expect(response.status).toBe(201)
  expect((await response.json()).id).toBe(saved.id)
  expect(await independent.booking.count()).toBe(1)
  expect((await independent.coupon.findUniqueOrThrow({ where: { id: coupon } })).currentUses).toBe(1)
})

it('returns one booking for concurrent identical authenticated requests, consuming the coupon once', async () => {
  const body = await input()
  const responses = await Promise.all([post(body), post(body)])
  expect(responses.map(response => response.status)).toEqual([201, 201])
  expect(responses[0].headers.get('cache-control')).toBe('private, no-store')
  const first = await responses[0].json(), second = await responses[1].json()
  expect(first.id).toBe(second.id)
  expect(await independent.booking.count()).toBe(1)
  expect(await independent.bookingCreateRequest.count()).toBe(1)
  expect(await independent.notification.count()).toBe(1)
  expect((await independent.coupon.findUniqueOrThrow({ where: { id: coupon } })).currentUses).toBe(1)
  expect(first).toMatchObject({ status: 'PENDING', totalAmountInCents: 5400 })
  expect(JSON.stringify(first)).not.toMatch(/payloadHash|requestId/)
})
it.each(['notes', 'startTime', 'athleteProfileId', 'couponCode'])('rejects altered %s under an already committed key', async field => {
  const body = await input()
  expect((await post(body)).status).toBe(201)
  const changed = { ...body, [field]: field === 'startTime' ? '10:00' : 'changed' }
  expect((await post(changed)).status).toBe(409)
  expect(await independent.booking.count()).toBe(1)
  expect((await independent.coupon.findUniqueOrThrow({ where: { id: coupon } })).currentUses).toBe(1)
})
it('does not turn a requested package into a single-session reservation or consume its coupon', async () => {
  const offer = await prisma.serviceOffering.findUniqueOrThrow({ where: { id: service } })
  const bundle = await prisma.package.create({ data: { trainerProfileId: offer.trainerProfileId, title: 'Synthetic five sessions',
    totalSessions: 5, priceInCents: 25000, validForDays: 90, items: { create: { serviceOfferingId: service, sessionsCount: 5 } } } })
  const body = { ...await input(), packageId: bundle.id }
  expect((await post(body)).status).toBe(400)
  expect(await independent.booking.count()).toBe(0)
  expect(await independent.bookingCreateRequest.count()).toBe(0)
  expect(await independent.payment.count()).toBe(0)
  expect(await independent.notification.count()).toBe(0)
  expect((await independent.coupon.findUniqueOrThrow({ where: { id: coupon } })).currentUses).toBe(0)
  await expect(createBooking(parent, body)).rejects.toMatchObject({ name: 'ZodError' })
})
it('does not replay an existing single-session reservation as a requested package purchase', async () => {
  const body = await input()
  const saved = await (await post(body)).json()
  const changed = { ...body, packagePurchaseId: 'unsupported-purchase' }
  expect((await post(changed)).status).toBe(400)
  expect(await independent.booking.count()).toBe(1)
  expect(await independent.bookingCreateRequest.count()).toBe(1)
  expect((await independent.booking.findUniqueOrThrow({ where: { id: saved.id } })).packageId).toBeNull()
  expect((await independent.coupon.findUniqueOrThrow({ where: { id: coupon } })).currentUses).toBe(1)
  expect(await independent.notification.count()).toBe(1)
})
it('returns the current cancelled booking even after trainer or service eligibility changes', async () => {
  const body = await input(), saved = await (await post(body)).json()
  await prisma.booking.update({ where: { id: saved.id }, data: { status: 'CANCELLED' } })
  await prisma.serviceOffering.update({ where: { id: service }, data: { isActive: false, priceInCents: 9000 } })
  await prisma.trainerProfile.update({ where: { userId: trainer }, data: { isActive: false } })
  const replay = await post(body)
  expect(replay.status).toBe(201)
  expect(await replay.json()).toMatchObject({ id: saved.id, status: 'CANCELLED', totalAmountInCents: 5400 })
  expect(await independent.booking.count()).toBe(1)
  expect(await independent.notification.count()).toBe(1)
})
it('does not recreate a booking after its stored identity is removed', async () => {
  const body = await input(), saved = await (await post(body)).json()
  await prisma.booking.delete({ where: { id: saved.id } })
  expect((await post(body)).status).toBe(409)
  expect(await independent.booking.count()).toBe(0)
  expect((await independent.bookingCreateRequest.findFirstOrThrow()).bookingId).toBeNull()
})
it('never duplicates the zero-due payment on replay', async () => {
  await prisma.coupon.update({ where: { id: coupon }, data: { discountPercent: 100 } })
  const body = await input()
  const first = await (await post(body)).json(), second = await (await post(body)).json()
  expect(second).toMatchObject({ id: first.id, status: 'CONFIRMED', totalAmountInCents: 0 })
  expect(await independent.payment.count()).toBe(1)
  expect((await independent.payment.findFirstOrThrow()).status).toBe('SUCCEEDED')
  expect(await independent.notification.count()).toBe(1)
})
it('isolates the same UUID between parents', async () => {
  const body = await input()
  const other = await prisma.user.create({ data: { email: `reservation-other-${randomUUID()}@example.test`, role: 'PARENT', passwordHash: 'not-a-login', parentProfile: { create: { athletes: { create: {
    firstName: 'Other', lastName: 'Athlete', dateOfBirth: new Date('2015-01-01'), goals: [], sports: { create: { sportId: sport } },
  } } } } }, include: { parentProfile: { include: { athletes: true } } } })
  userIds.push(other.id)
  const first = await (await post(body)).json()
  const response = await post({ ...body, athleteProfileId: other.parentProfile!.athletes[0].id, startTime: '10:00' }, other.id)
  expect(response.status).toBe(201)
  expect((await response.json()).id).not.toBe(first.id)
  expect(await independent.bookingCreateRequest.count()).toBe(2)
})
it.each(['TRAINER', 'ADMIN', 'deleted'])('rechecks current parent access inside creation and replay: %s', async state => {
  const body = await input()
  expect((await post(body)).status).toBe(201)
  await prisma.user.update({ where: { id: parent }, data: state === 'deleted' ? { deletedAt: new Date() } : { role: state as 'TRAINER' | 'ADMIN' } })
  await expect(createBooking(parent, body)).rejects.toMatchObject({ status: 403 })
  expect(await independent.booking.count()).toBe(1)
})
it('rolls back reservation, coupon, free payment and notification when ledger insertion fails', async () => {
  await prisma.coupon.update({ where: { id: coupon }, data: { discountPercent: 100 } })
  const body = await input()
  await prisma.$executeRawUnsafe('ALTER TABLE booking_create_requests ADD CONSTRAINT booking_request_test_failure CHECK (false) NOT VALID')
  try {
    expect((await post(body)).status).toBe(503)
    expect(await independent.booking.count()).toBe(0)
    expect(await independent.payment.count()).toBe(0)
    expect(await independent.notification.count()).toBe(0)
    expect(await independent.bookingCreateRequest.count()).toBe(0)
    expect((await independent.coupon.findUniqueOrThrow({ where: { id: coupon } })).currentUses).toBe(0)
  } finally { await prisma.$executeRawUnsafe('ALTER TABLE booking_create_requests DROP CONSTRAINT booking_request_test_failure') }
  expect((await post(body)).status).toBe(201)
  expect(await independent.booking.count()).toBe(1)
})
