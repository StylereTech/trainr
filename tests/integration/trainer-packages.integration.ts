import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { readTrainerPackages, saveTrainerPackage } from '@/lib/trainer-packages'
import { GET, PUT } from '@/app/api/trainer/packages/route'
import { saveTrainerServices } from '@/lib/trainer-services'

const auth = vi.hoisted(() => ({ actor: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getRequestUser: auth.actor }))
const independent = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL })
let ownerId: string, trainerId: string, otherId: string, sportId: string, serviceId: string, otherServiceId: string
let parentId: string | undefined
let verified = false
const command = (change = {}) => ({ action: 'save', id: randomUUID(), revision: null, title: 'Five sessions', description: 'Synthetic package',
  priceInCents: 25000, validForDays: 90, items: [{ serviceOfferingId: serviceId, sessionsCount: 5 }], ...change })
const put = (body: unknown) => PUT(new NextRequest('http://localhost/api/trainer/packages', { method: 'PUT', body: JSON.stringify(body) }))
beforeAll(async () => {
  expect(await prisma.$queryRaw`SELECT purpose FROM trainr_test_guard`).toEqual([{ purpose: 'disposable integration database' }])
  const [identity] = await prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`
  expect(identity.name).toMatch(/^trainr_audit_/)
  verified = true
})
beforeEach(async () => {
  vi.resetAllMocks()
  parentId = undefined
  const key = randomUUID()
  const sport = await prisma.sport.create({ data: { name: `Synthetic ${key}`, slug: key } })
  sportId = sport.id
  const create = (suffix: string) => prisma.user.create({ data: { email: `package-${key}-${suffix}@example.test`, role: 'TRAINER', passwordHash: 'not-a-login',
    trainerProfile: { create: { firstName: 'Synthetic', lastName: 'Trainer', slug: `${key}-${suffix}`, sports: { create: { sportId } },
      serviceOfferings: { create: { title: 'Synthetic session', sportId, priceInCents: 6000 } } } } },
    include: { trainerProfile: { include: { serviceOfferings: true } } } })
  const user = await create('owner'), other = await create('other')
  ownerId = user.id; otherId = other.id; trainerId = user.trainerProfile!.id
  serviceId = user.trainerProfile!.serviceOfferings[0].id; otherServiceId = other.trainerProfile!.serviceOfferings[0].id
  auth.actor.mockResolvedValue({ id: ownerId, role: 'TRAINER' })
})
afterEach(async () => {
  if (!verified) return
  await prisma.booking.deleteMany({ where: { trainerProfileId: trainerId } })
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, otherId, ...(parentId ? [parentId] : [])] } } })
  await prisma.sport.delete({ where: { id: sportId } })
})
afterAll(async () => { await prisma.$disconnect(); await independent.$disconnect() })

describe('real SQL trainer package management', () => {
  it.each(['edit', 'remove'])('deactivates package listings atomically when a referenced service is retired by %s', async mode => {
    const first = await saveTrainerPackage(ownerId, command())
    const active = await saveTrainerPackage(ownerId, { action: 'setActive', id: first.id, revision: first.revision, isActive: true })
    const retained = await prisma.serviceOffering.create({ data: { trainerProfileId: trainerId, sportId, title: 'Other service', priceInCents: 2000 } })
    const service = await prisma.serviceOffering.findUniqueOrThrow({ where: { id: serviceId } })
    const asInput = (value: typeof service) => ({ id: value.id, sportId, title: value.title, description: '', durationMinutes: value.durationMinutes,
      priceInCents: value.priceInCents, type: value.type, maxParticipants: value.maxParticipants })
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM trainer_profiles WHERE id = ${trainerId} FOR UPDATE`
      await saveTrainerServices(tx, trainerId, [...(mode === 'edit' ? [{ ...asInput(service), title: 'Changed service' }] : []), asInput(retained)], new Set([sportId]))
    })
    const saved = await independent.package.findUniqueOrThrow({ where: { id: first.id }, include: { items: true } })
    expect(saved.isActive).toBe(false)
    expect(saved.updatedAt.toISOString()).not.toBe(active.revision)
    expect(saved.items[0].serviceOfferingId).toBe(serviceId)
    expect(saved.priceInCents).toBe(25000)
    expect((await put({ action: 'setActive', id: first.id, revision: active.revision, isActive: true })).status).toBe(409)
  })
  it('creates inactive terms, calculates counts, reloads and exposes only owned packages', async () => {
    const response = await put(command())
    expect(response.status).toBe(200)
    const saved = (await response.json()).package
    expect(saved).toMatchObject({ totalSessions: 5, isActive: false, priceInCents: 25000, termsLocked: false })
    expect((await independent.package.findUniqueOrThrow({ where: { id: saved.id } })).trainerProfileId).toBe(trainerId)
    const listing = await (await GET(new NextRequest('http://localhost/api/trainer/packages'))).json()
    expect(listing.packages).toHaveLength(1)
    expect(listing.services.map((value: { id: string }) => value.id)).toEqual([serviceId])
    expect(JSON.stringify(listing)).not.toContain(otherServiceId)
    expect(await readTrainerPackages(otherId, 1)).toMatchObject({ packages: [], total: 0 })
    expect(await prisma.payment.count()).toBe(0)
    expect(await prisma.booking.count()).toBe(0)
  })
  it('rolls back service retirement and package visibility together on a later failure', async () => {
    const first = await saveTrainerPackage(ownerId, command())
    const active = await saveTrainerPackage(ownerId, { action: 'setActive', id: first.id, revision: first.revision, isActive: true })
    await expect(prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM trainer_profiles WHERE id = ${trainerId} FOR UPDATE`
      await saveTrainerServices(tx, trainerId, [], new Set([sportId]))
      throw new Error('synthetic later failure')
    })).rejects.toThrow('synthetic later failure')
    expect((await independent.serviceOffering.findUniqueOrThrow({ where: { id: serviceId } })).isActive).toBe(true)
    const saved = await independent.package.findUniqueOrThrow({ where: { id: first.id } })
    expect(saved.isActive).toBe(true)
    expect(saved.updatedAt.toISOString()).toBe(active.revision)
  })
  it('rechecks service eligibility after waiting for a concurrent profile edit', async () => {
    let entered!: () => void, release!: () => void
    const started = new Promise<void>(resolve => { entered = resolve })
    const holder = independent.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM trainer_profiles WHERE id = ${trainerId} FOR UPDATE`
      const wait = new Promise<void>(resolve => { release = resolve }); entered(); await wait
      await tx.serviceOffering.update({ where: { id: serviceId }, data: { isActive: false } })
    })
    await started
    const response = put(command())
    try {
      await expect.poll(async () => {
        const [waiting] = await prisma.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int AS count FROM pg_stat_activity WHERE wait_event_type='Lock' AND cardinality(pg_blocking_pids(pid)) > 0`
        return waiting.count
      }).toBeGreaterThan(0)
    } finally { release(); await holder }
    expect((await response).status).toBe(409)
    expect(await prisma.package.count({ where: { trainerProfileId: trainerId } })).toBe(0)
  })
  it('concurrent identical creation requests persist one durable package', async () => {
    const input = command()
    const results = await Promise.all([saveTrainerPackage(ownerId, input), saveTrainerPackage(ownerId, input)])
    expect(results[0].id).toBe(results[1].id)
    expect(await prisma.package.count({ where: { trainerProfileId: trainerId } })).toBe(1)
    expect(await prisma.packageItem.count({ where: { packageId: input.id } })).toBe(1)
    expect((await put({ ...input, priceInCents: 26000 })).status).toBe(409)
  })
  it('edits in place with an exact revision and replaces item counts atomically', async () => {
    const first = await saveTrainerPackage(ownerId, command())
    const updated = await saveTrainerPackage(ownerId, command({ id: first.id, revision: first.revision, title: 'Six sessions', items: [{ serviceOfferingId: serviceId, sessionsCount: 6 }] }))
    expect(updated).toMatchObject({ id: first.id, totalSessions: 6, title: 'Six sessions' })
    expect(updated.revision).not.toBe(first.revision)
    expect(await prisma.packageItem.count({ where: { packageId: first.id } })).toBe(1)
    expect((await put(command({ id: first.id, revision: first.revision }))).status).toBe(409)
  })
  it('allows only one writer using the same reviewed revision', async () => {
    const first = await saveTrainerPackage(ownerId, command())
    const results = await Promise.allSettled([27000, 28000].map(priceInCents => saveTrainerPackage(ownerId, command({ id: first.id, revision: first.revision, priceInCents }))))
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
  })
  it.each(['foreign', 'inactive', 'disabled-sport', 'removed-sport'])('rejects %s services without writes', async reason => {
    if (reason === 'inactive') await prisma.serviceOffering.update({ where: { id: serviceId }, data: { isActive: false } })
    if (reason === 'disabled-sport') await prisma.sport.update({ where: { id: sportId }, data: { isActive: false } })
    if (reason === 'removed-sport') await prisma.trainerSport.deleteMany({ where: { trainerProfileId: trainerId } })
    const response = await put(command({ items: [{ serviceOfferingId: reason === 'foreign' ? otherServiceId : serviceId, sessionsCount: 5 }] }))
    expect(response.status).toBe(409)
    expect(await prisma.package.count({ where: { trainerProfileId: trainerId } })).toBe(0)
  })
  it('denies another trainer package identity and prevents create-key takeover', async () => {
    const other = await saveTrainerPackage(otherId, command({ items: [{ serviceOfferingId: otherServiceId, sessionsCount: 3 }] }))
    expect((await put(command({ id: other.id, revision: null }))).status).toBe(404)
    expect((await put({ action: 'setActive', id: other.id, revision: other.revision, isActive: true })).status).toBe(404)
    expect((await prisma.package.findUniqueOrThrow({ where: { id: other.id } })).isActive).toBe(false)
  })
  it('activates/deactivates explicitly and rejects stale or unavailable activation', async () => {
    const first = await saveTrainerPackage(ownerId, command())
    const active = await saveTrainerPackage(ownerId, { action: 'setActive', id: first.id, revision: first.revision, isActive: true })
    expect(active.isActive).toBe(true)
    expect((await put({ action: 'setActive', id: first.id, revision: first.revision, isActive: false })).status).toBe(409)
    await prisma.serviceOffering.update({ where: { id: serviceId }, data: { isActive: false } })
    const archived = await saveTrainerPackage(ownerId, { action: 'setActive', id: first.id, revision: active.revision, isActive: false })
    expect(archived.isActive).toBe(false)
    expect(archived.items[0].available).toBe(false)
    expect((await put({ action: 'setActive', id: first.id, revision: archived.revision, isActive: true })).status).toBe(409)
  })
  it('cannot activate legacy inconsistent session totals', async () => {
    const first = await saveTrainerPackage(ownerId, command())
    const invalid = await prisma.package.update({ where: { id: first.id }, data: { totalSessions: 999 } })
    expect((await put({ action: 'setActive', id: first.id, revision: invalid.updatedAt.toISOString(), isActive: true })).status).toBe(409)
  })
  it('preserves booked terms and allows a separate package or deactivation', async () => {
    const first = await saveTrainerPackage(ownerId, command())
    const parent = await prisma.user.create({ data: { email: `package-parent-${randomUUID()}@example.test`, role: 'PARENT', passwordHash: 'not-a-login', parentProfile: { create: {
      athletes: { create: { firstName: 'Synthetic', lastName: 'Athlete', dateOfBirth: new Date('2015-01-01'), goals: [] } },
    } } }, include: { parentProfile: { include: { athletes: true } } } })
    parentId = parent.id
    const booking = await prisma.booking.create({ data: { parentProfileId: parent.parentProfile!.id, athleteProfileId: parent.parentProfile!.athletes[0].id,
      trainerProfileId: trainerId, serviceOfferingId: serviceId, packageId: first.id, date: new Date('2026-12-01'), startTime: '09:00', endTime: '10:00',
      totalAmountInCents: 5000, platformFeeInCents: 750, trainerPayoutInCents: 4250 } })
    expect((await readTrainerPackages(ownerId, 1)).packages[0].termsLocked).toBe(true)
    expect((await put(command({ id: first.id, revision: first.revision, priceInCents: 30000 }))).status).toBe(409)
    const duplicate = await saveTrainerPackage(ownerId, command({ priceInCents: 30000 }))
    expect(duplicate.id).not.toBe(first.id)
    await saveTrainerPackage(ownerId, { action: 'setActive', id: first.id, revision: first.revision, isActive: false })
    expect((await independent.booking.findUniqueOrThrow({ where: { id: booking.id } })).packageId).toBe(first.id)
    expect((await independent.package.findUniqueOrThrow({ where: { id: first.id } })).priceInCents).toBe(25000)
  })
  it('rolls back deleted items and changed terms when replacement insert fails', async () => {
    const first = await saveTrainerPackage(ownerId, command())
    await prisma.$executeRawUnsafe('ALTER TABLE package_items ADD CONSTRAINT package_test_failure CHECK ("sessionsCount" <> 13)')
    try {
      expect((await put(command({ id: first.id, revision: first.revision, title: 'Rejected', items: [{ serviceOfferingId: serviceId, sessionsCount: 13 }] }))).status).toBe(503)
      const saved = await independent.package.findUniqueOrThrow({ where: { id: first.id }, include: { items: true } })
      expect(saved.title).toBe(first.title)
      expect(saved.items.map(item => item.sessionsCount)).toEqual([5])
      expect(saved.updatedAt.toISOString()).toBe(first.revision)
    } finally { await prisma.$executeRawUnsafe('ALTER TABLE package_items DROP CONSTRAINT package_test_failure') }
  })
  it('rechecks revoked role after waiting for the user lock', async () => {
    let entered!: () => void, release!: () => void
    const started = new Promise<void>(resolve => { entered = resolve })
    const holder = independent.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${ownerId} FOR UPDATE`
      const wait = new Promise<void>(resolve => { release = resolve }); entered(); await wait
      await tx.user.update({ where: { id: ownerId }, data: { role: 'PARENT' } })
    })
    await started
    const response = put(command())
    try {
      await expect.poll(async () => {
        const [waiting] = await prisma.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int AS count FROM pg_stat_activity WHERE wait_event_type='Lock' AND cardinality(pg_blocking_pids(pid)) > 0`
        return waiting.count
      }).toBeGreaterThan(0)
    } finally { release(); await holder }
    expect((await response).status).toBe(403)
    expect(await prisma.package.count({ where: { trainerProfileId: trainerId } })).toBe(0)
  })
  it('paginates owned records consistently and clamps an out-of-range page', async () => {
    await prisma.package.createMany({ data: Array.from({ length: 21 }, (_, index) => ({ trainerProfileId: trainerId, title: `Synthetic ${index}`, totalSessions: 1, priceInCents: 10000, isActive: false })) })
    const first = await readTrainerPackages(ownerId, 1), last = await readTrainerPackages(ownerId, 999)
    expect(first).toMatchObject({ page: 1, total: 21, totalPages: 2 })
    expect(first.packages).toHaveLength(20)
    expect(last).toMatchObject({ page: 2, total: 21, totalPages: 2 })
    expect(last.packages).toHaveLength(1)
    expect(new Set([...first.packages, ...last.packages].map(value => value.id)).size).toBe(21)
  })
})
