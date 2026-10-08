import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createBooking } from '@/lib/booking-creation'
import { applyBookingAction } from '@/lib/booking-actions'
import { applyPaymentEvidence } from '@/lib/stripe-payment-events'
import { startOrResumeCheckout } from '@/lib/checkout-attempts'
import { defaultFeeValues, updateFeeConfiguration } from '@/lib/fee-config'
import { saveTrainerCertifications } from '@/lib/trainer-certifications'
import { GET as getTrainerProfile, PUT as putTrainerProfile } from '@/app/api/trainer/onboarding/route'

// Stripe and route authentication are simulated. Prisma transactions, constraints and row locks are real.
const provider = vi.hoisted(() => ({ create: vi.fn(), retrieve: vi.fn(), intent: vi.fn() }))
const auth = vi.hoisted(() => ({ session: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getServerSession: auth.session, authOptions: {} }))
vi.mock('@/lib/stripe', () => ({ stripe: { checkout: { sessions: { create: provider.create, retrieve: provider.retrieve } }, paymentIntents: { retrieve: provider.intent } } }))
vi.mock('@/lib/app-url', () => ({ toAbsoluteAppUrl: (path: string) => `http://localhost:3107${path}` }))
const independent = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL })
let fixture: { parent: string; trainerUser: string; trainer: string; service: string; sport: string; athletes: string[]; date: string }
const createdParents: string[] = []
const createdTrainers: string[] = []
const createdCoupons: string[] = []
const createdConfigs: string[] = []
const createdSports: string[] = []
let verifiedTarget = false

beforeAll(async () => {
  const identity = await prisma.$queryRaw<Array<{ database: string; version: string }>>`SELECT current_database() AS database, version()`
  expect(identity[0].database).toMatch(/^trainr_audit_/)
  expect(identity[0].version).toContain('PostgreSQL')
  const marker = await prisma.$queryRaw<Array<{ purpose: string }>>`SELECT purpose FROM trainr_test_guard`
  expect(marker).toEqual([{ purpose: 'disposable integration database' }])
  verifiedTarget = true
})

beforeEach(async () => {
  vi.resetAllMocks()
  const id = `audit-${randomUUID()}`
  const sport = await prisma.sport.create({ data: { name: id, slug: id } })
  createdSports.push(sport.id)
  const parent = await prisma.user.create({ data: { email: `${id}-parent@example.test`, passwordHash: 'not-a-login', role: 'PARENT',
    parentProfile: { create: { athletes: { create: [0, 1, 2].map((n) => ({ firstName: 'Synthetic', lastName: `Athlete ${n}`, dateOfBirth: new Date('2015-01-01'), goals: [], sports: { create: { sportId: sport.id } } })) } } } },
    include: { parentProfile: { include: { athletes: true } } } })
  createdParents.push(parent.id)
  const trainer = await prisma.user.create({ data: { email: `${id}-trainer@example.test`, passwordHash: 'not-a-login', role: 'TRAINER',
    trainerProfile: { create: { firstName: 'Synthetic', lastName: 'Trainer', slug: id, approvalStatus: 'APPROVED', stripeAccountId: 'acct_synthetic',
      sports: { create: { sportId: sport.id } },
      serviceOfferings: { create: { title: 'Synthetic session', priceInCents: 6000, durationMinutes: 60, sportId: sport.id } },
      availabilitySlots: { create: { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' } } } } },
    include: { trainerProfile: { include: { serviceOfferings: true } } } })
  createdTrainers.push(trainer.id)
  fixture = { parent: parent.id, trainerUser: trainer.id, trainer: trainer.trainerProfile!.id,
    service: trainer.trainerProfile!.serviceOfferings[0].id, sport: sport.id, athletes: parent.parentProfile!.athletes.map((a) => a.id), date: '2030-11-04' }
  auth.session.mockResolvedValue({ user: { id: trainer.id, role: 'TRAINER' } })
  const sessions = new Map<string, any>()
  provider.create.mockImplementation(async (parameters, options) => {
    const key = options.idempotencyKey
    if (!sessions.has(key)) sessions.set(key, { id: `cs_${randomUUID()}`, status: 'open', payment_status: 'unpaid', payment_intent: null,
      mode: 'payment', currency: 'usd', amount_total: parameters.line_items[0].price_data.unit_amount, metadata: parameters.metadata, url: 'https://checkout.stripe.com/synthetic-only' })
    return sessions.get(key)
  })
  provider.retrieve.mockImplementation(async (id) => Array.from(sessions.values()).find((session) => session.id === id))
})

afterEach(async () => {
  if (!verifiedTarget || !createdConfigs.length) return
  await prisma.adminAction.deleteMany({ where: { targetType: 'FEE_CONFIG', targetId: { in: createdConfigs } } })
  await prisma.feeConfig.deleteMany({ where: { id: { in: createdConfigs } } })
  createdConfigs.length = 0
})

afterAll(async () => {
  if (!verifiedTarget) {
    await Promise.all([prisma.$disconnect(), independent.$disconnect()])
    return
  }
  // Delete only this run's synthetic records, never truncate the database.
  await prisma.booking.deleteMany({ where: { trainerProfile: { userId: { in: createdTrainers } } } })
  await prisma.coupon.deleteMany({ where: { id: { in: createdCoupons } } })
  await prisma.user.deleteMany({ where: { id: { in: [...createdParents, ...createdTrainers] } } })
  await prisma.sport.deleteMany({ where: { id: { in: createdSports } } })
  await Promise.all([prisma.$disconnect(), independent.$disconnect()])
})

const reserve = (athlete = 0, startTime = '09:00', couponCode?: string) => createBooking(fixture.parent, {
  serviceOfferingId: fixture.service, athleteProfileId: fixture.athletes[athlete], date: fixture.date, startTime, couponCode,
})
async function pendingPayment(bookingId: string) {
  return prisma.payment.create({ data: { bookingId, amountInCents: 6000, platformFeeInCents: 900, trainerPayoutInCents: 5100 } })
}

describe('real PostgreSQL money-flow persistence', () => {
  async function profileInput() {
    const sports = []
    for (let i = 0; i < 2; i++) {
      const slug = `audit-${randomUUID()}`
      const sport = await prisma.sport.create({ data: { name: slug, slug, specialties: { create: { name: 'Defense', slug: 'defense' } } }, include: { specialties: true } })
      createdSports.push(sport.id)
      sports.push(sport)
    }
    const trainer = await prisma.trainerProfile.findUniqueOrThrow({ where: { id: fixture.trainer } })
    return { sports, input: { revision: trainer.updatedAt.toISOString(), firstName: 'Synthetic', lastName: 'Trainer', yearsExperience: 1, locationType: 'BOTH',
      sports: sports.map((sport) => sport.slug), specialties: sports.map((sport) => sport.specialties[0].id),
      services: [{ id: fixture.service, sportId: sports[0].id, title: 'Synthetic session', priceInCents: 6000, durationMinutes: 60, type: 'INDIVIDUAL', maxParticipants: 1 }],
      availability: [{ dayOfWeek: 1, startTime: '09:00', endTime: '17:00' }] } }
  }
  const submitProfile = (input: unknown) => putTrainerProfile(new Request('http://localhost/api/trainer/onboarding', { method: 'PUT', body: JSON.stringify(input) }) as any)

  it.each(['unassigned', 'inactive', 'removed'])('blocks real reservations for %s service sports without writes', async (condition) => {
    if (condition === 'unassigned') await prisma.serviceOffering.update({ where: { id: fixture.service }, data: { sportId: null } })
    if (condition === 'inactive') await prisma.sport.update({ where: { id: fixture.sport }, data: { isActive: false } })
    if (condition === 'removed') await prisma.trainerSport.deleteMany({ where: { trainerProfileId: fixture.trainer } })
    await expect(reserve()).rejects.toMatchObject({ status: 409 })
    expect(await independent.booking.count({ where: { trainerProfileId: fixture.trainer } })).toBe(0)
    expect(await independent.notification.count({ where: { userId: fixture.trainerUser } })).toBe(0)
  })

  it('repairs a null service sport through the actual handler and enforces athlete membership', async () => {
    await prisma.serviceOffering.update({ where: { id: fixture.service }, data: { sportId: null } })
    const { input, sports } = await profileInput()
    const response = await submitProfile(input)
    expect(response.status).toBe(200)
    expect((await response.json()).services[0]).toMatchObject({ id: fixture.service, sportId: sports[0].id })
    expect((await independent.serviceOffering.findUniqueOrThrow({ where: { id: fixture.service } })).sportId).toBe(sports[0].id)
    await expect(reserve()).rejects.toMatchObject({ status: 400 })
    await prisma.athleteSport.create({ data: { athleteProfileId: fixture.athletes[0], sportId: sports[0].id } })
    expect((await reserve()).status).toBe('PENDING')
  })

  it('versions a booked service sport while retaining the existing booking relationship', async () => {
    const booking = await reserve()
    const { input, sports } = await profileInput()
    const response = await submitProfile(input)
    expect(response.status).toBe(200)
    const saved = await response.json()
    expect(saved.services[0].id).not.toBe(fixture.service)
    const historical = await independent.booking.findUniqueOrThrow({ where: { id: booking.id }, include: { serviceOffering: true } })
    expect(historical.serviceOffering).toMatchObject({ id: fixture.service, sportId: fixture.sport, isActive: false })
    expect(await independent.serviceOffering.findUniqueOrThrow({ where: { id: saved.services[0].id } })).toMatchObject({ sportId: sports[0].id, isActive: true })
    const refreshed = await (await getTrainerProfile(new Request('http://localhost/api/trainer/onboarding') as any)).json()
    expect(refreshed.services).toHaveLength(1)
    expect(refreshed.services[0]).toMatchObject({ id: saved.services[0].id, sportId: sports[0].id })
  })

  it('persists catalog IDs through actual profile handlers and rejects invalid links without changes', async () => {
    const { input, sports } = await profileInput()
    const response = await submitProfile(input)
    expect(response.status).toBe(200)
    const saved = await response.json()
    const refreshed = await (await getTrainerProfile(new Request('http://localhost/api/trainer/onboarding') as any)).json()
    expect(new Set(refreshed.specialties)).toEqual(new Set(input.specialties))
    expect(refreshed.catalog.find((sport: any) => sport.id === sports[0].id).specialties[0].id).toBe(input.specialties[0])
    const updatedAt = (await independent.trainerProfile.findUniqueOrThrow({ where: { id: fixture.trainer } })).updatedAt
    for (const change of [
      { specialties: ['defense'] }, { sports: [sports[0].slug], specialties: [input.specialties[1]] },
      { sports: ['nonexistent-synthetic-sport'] }, { specialties: [input.specialties[0], input.specialties[0]] },
    ]) {
      expect((await submitProfile({ ...input, revision: saved.revision, headline: 'Must not persist', ...change })).status).toBe(409)
      expect((await independent.trainerProfile.findUniqueOrThrow({ where: { id: fixture.trainer } })).updatedAt).toEqual(updatedAt)
      expect(await independent.trainerSpecialty.count({ where: { trainerProfileId: fixture.trainer } })).toBe(2)
    }
    await prisma.sport.update({ where: { id: sports[0].id }, data: { isActive: false } })
    expect((await submitProfile({ ...input, revision: saved.revision })).status).toBe(409)
  })

  it('rolls back profile and catalog links when later availability SQL fails', async () => {
    const { input } = await profileInput()
    expect(fixture.trainer).toMatch(/^[a-z0-9]+$/)
    await independent.$executeRawUnsafe(`ALTER TABLE availability_slots ADD CONSTRAINT trainr_integration_availability_failure CHECK ("trainerProfileId" <> '${fixture.trainer}') NOT VALID`)
    try {
      expect((await submitProfile(input)).status).toBe(503)
      expect(await independent.trainerSport.findMany({ where: { trainerProfileId: fixture.trainer }, select: { sportId: true } })).toEqual([{ sportId: fixture.sport }])
      expect(await independent.trainerSpecialty.count({ where: { trainerProfileId: fixture.trainer } })).toBe(0)
      expect((await independent.trainerProfile.findUniqueOrThrow({ where: { id: fixture.trainer } })).updatedAt.toISOString()).toBe(input.revision)
      expect((await independent.serviceOffering.findUniqueOrThrow({ where: { id: fixture.service } })).sportId).toBe(fixture.sport)
      expect(await independent.availabilitySlot.count({ where: { trainerProfileId: fixture.trainer } })).toBe(1)
    } finally {
      await independent.$executeRawUnsafe('ALTER TABLE availability_slots DROP CONSTRAINT trainr_integration_availability_failure')
    }
  })

  async function verifiedCredential() {
    return prisma.certification.create({ data: { trainerProfileId: fixture.trainer, name: 'Synthetic certification', issuingOrg: 'Example Org',
      credentialId: 'AUDIT-123', isVerified: true, issueDate: new Date('2020-01-01'), expiryDate: new Date('2035-01-01'), url: 'https://example.test/evidence' } })
  }
  it('preserves certification evidence and clears verification only on identifying edits', async () => {
    const cert = await verifiedCredential()
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM trainer_profiles WHERE id = ${fixture.trainer} FOR UPDATE`
      await saveTrainerCertifications(tx, fixture.trainer, [{ id: cert.id, name: cert.name, issuingOrg: cert.issuingOrg! }])
    })
    expect(await independent.certification.findUniqueOrThrow({ where: { id: cert.id } })).toEqual(cert)
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM trainer_profiles WHERE id = ${fixture.trainer} FOR UPDATE`
      await saveTrainerCertifications(tx, fixture.trainer, [{ id: cert.id, name: 'Changed credential', credentialId: 'AUDIT-456' }])
    })
    expect(await independent.certification.findUniqueOrThrow({ where: { id: cert.id } })).toMatchObject({ ...cert, name: 'Changed credential', credentialId: 'AUDIT-456', isVerified: false })
  })
  it('cannot use a certification owned by another real trainer row', async () => {
    const cert = await verifiedCredential()
    const other = await prisma.user.create({ data: { email: `audit-${randomUUID()}@example.test`, role: 'TRAINER', passwordHash: 'not-a-login',
      trainerProfile: { create: { firstName: 'Other', lastName: 'Synthetic', slug: randomUUID() } } }, include: { trainerProfile: true } })
    createdTrainers.push(other.id)
    await expect(prisma.$transaction((tx) => saveTrainerCertifications(tx, other.trainerProfile!.id, [{ id: cert.id, name: 'Stolen' }]))).rejects.toThrow('not owned')
    expect(await independent.certification.findUniqueOrThrow({ where: { id: cert.id } })).toEqual(cert)
  })
  it('rolls back certification edits after a real later database failure', async () => {
    const cert = await verifiedCredential()
    await expect(prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM trainer_profiles WHERE id = ${fixture.trainer} FOR UPDATE`
      await saveTrainerCertifications(tx, fixture.trainer, [{ id: cert.id, name: 'Changed name' }])
      await tx.notification.create({ data: { userId: 'missing-synthetic-user', type: 'BOOKING_REQUEST', title: 'Synthetic', message: 'Expected failure' } })
    })).rejects.toThrow()
    expect(await independent.certification.findUniqueOrThrow({ where: { id: cert.id } })).toEqual(cert)
  })

  async function config(commission: number, expectedConfigId: string | null = null) {
    const row = await updateFeeConfiguration(fixture.trainerUser, { ...defaultFeeValues, platformCommissionPercent: commission, expectedConfigId })
    createdConfigs.push(row.id)
    return row
  }

  it('snapshots configured commission and preserves old booking terms through checkout', async () => {
    const first = await config(20)
    const old = await reserve()
    expect(old.platformFeeInCents).toBe(1200)
    await config(10, first.id)
    const fresh = await reserve(1, '10:00')
    expect(fresh.platformFeeInCents).toBe(600)
    await startOrResumeCheckout(old.id, { id: fixture.parent }, 'acct_synthetic')
    const payment = await independent.payment.findUniqueOrThrow({ where: { bookingId: old.id } })
    expect(payment).toMatchObject({ amountInCents: 6000, platformFeeInCents: 1200, trainerPayoutInCents: 4800 })
    expect(provider.create.mock.calls[0][0].payment_intent_data.application_fee_amount).toBe(1200)
  })

  it('serializes real concurrent fee updates and rejects the stale writer', async () => {
    const results = await Promise.allSettled([config(20), config(25)])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(await independent.feeConfig.count({ where: { isActive: true } })).toBe(1)
    expect(await independent.adminAction.count({ where: { targetId: { in: createdConfigs } } })).toBe(1)
  })

  it('rolls back fee replacement when the actual audit foreign key fails', async () => {
    const first = await config(20)
    await expect(updateFeeConfiguration('nonexistent-synthetic-admin', { ...defaultFeeValues, expectedConfigId: first.id })).rejects.toThrow()
    expect((await independent.feeConfig.findUniqueOrThrow({ where: { id: first.id } })).isActive).toBe(true)
    expect(await independent.feeConfig.count()).toBe(1)
  })

  it.each([0, 49, 50])('persists only payable or free discounted bookings: %s cents', async (remaining) => {
    const coupon = await prisma.coupon.create({ data: { code: randomUUID().replaceAll('-', '').toUpperCase(), discountAmountInCents: 6000 - remaining, maxUses: 1, createdById: 'synthetic-test-operator' } })
    createdCoupons.push(coupon.id)
    if (remaining === 49) {
      await expect(reserve(0, '09:00', coupon.code)).rejects.toMatchObject({ status: 400 })
      expect((await independent.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).currentUses).toBe(0)
      expect(await independent.booking.count({ where: { trainerProfileId: fixture.trainer } })).toBe(0)
      expect(await independent.notification.count({ where: { userId: fixture.trainerUser } })).toBe(0)
      return
    }
    const booking = await reserve(0, '09:00', coupon.code)
    if (remaining === 50) await startOrResumeCheckout(booking.id, { id: fixture.parent }, 'acct_synthetic')
    const saved = await independent.booking.findUniqueOrThrow({ where: { id: booking.id }, include: { payment: true } })
    expect(saved.totalAmountInCents).toBe(remaining)
    expect(saved.status).toBe(remaining === 0 ? 'CONFIRMED' : 'PENDING')
    expect(saved.payment?.amountInCents).toBe(remaining)
    expect(saved.payment?.status).toBe(remaining === 0 ? 'SUCCEEDED' : 'PENDING')
    expect(saved.platformFeeInCents + saved.trainerPayoutInCents).toBe(remaining)
    expect((await independent.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).currentUses).toBe(1)
    expect(provider.create).toHaveBeenCalledTimes(remaining === 0 ? 0 : 1)
  })

  it('uses independent PostgreSQL sessions', async () => {
    const [a, b] = await Promise.all([
      prisma.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`,
      independent.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`,
    ])
    expect(a[0].pid).not.toBe(b[0].pid)
  })

  it('has the exact partial unique index from the checkout migration', async () => {
    const indexes = await prisma.$queryRaw<Array<{ indexdef: string }>>`SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'checkout_attempts_one_active_payment'`
    expect(indexes).toHaveLength(1)
    expect(indexes[0].indexdef).toMatch(/UNIQUE.*paymentId.*WHERE.*retiredAt.*IS NULL/)
  })

  it('allows only one winner for concurrent overlapping individual reservations', async () => {
    const results = await Promise.allSettled([reserve(0), reserve(1), reserve(2)])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(await independent.booking.count({ where: { trainerProfileId: fixture.trainer } })).toBe(1)
  })

  it('observes an actual PostgreSQL lock wait before a reservation can commit', async () => {
    let release!: () => void
    let ready!: (pid: number) => void
    const locked = new Promise<number>((resolve) => { ready = resolve })
    const hold = independent.$transaction(async (tx) => {
      const [backend] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`
      await tx.$queryRaw`SELECT id FROM trainer_profiles WHERE id = ${fixture.trainer} FOR UPDATE`
      const untilReleased = new Promise<void>((resolve) => { release = resolve })
      ready(backend.pid)
      await untilReleased
    }, { timeout: 15000 })
    const holder = await locked
    const reservation = reserve()
    try {
      await expect.poll(async () => {
        const [waiters] = await independent.$queryRaw<Array<{ count: number }>>`SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE ${holder} = ANY(pg_blocking_pids(pid)) AND wait_event_type = 'Lock'`
        return waiters.count
      }, { timeout: 5000 }).toBeGreaterThan(0)
    } finally {
      release()
      await hold
      await reservation
    }
    expect(await independent.booking.count({ where: { trainerProfileId: fixture.trainer } })).toBe(1)
  })

  it('enforces group capacity across concurrent transactions', async () => {
    await prisma.serviceOffering.update({ where: { id: fixture.service }, data: { type: 'GROUP', maxParticipants: 2 } })
    const results = await Promise.allSettled([reserve(0), reserve(1), reserve(2)])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2)
  })

  it('spends a single-use coupon only once across different session times', async () => {
    const coupon = await prisma.coupon.create({ data: { code: randomUUID().replaceAll('-', '').toUpperCase(), discountPercent: 10, maxUses: 1, createdById: 'synthetic-test-operator' } })
    createdCoupons.push(coupon.id)
    const results = await Promise.allSettled([reserve(0, '09:00', coupon.code), reserve(1, '10:00', coupon.code)])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect((await independent.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).currentUses).toBe(1)
    expect(await independent.booking.count({ where: { trainerProfileId: fixture.trainer } })).toBe(1)
  })

  it('rolls back coupon and booking when PostgreSQL rejects the notification write', async () => {
    const coupon = await prisma.coupon.create({ data: { code: randomUUID().replaceAll('-', '').toUpperCase(), discountPercent: 10, maxUses: 1, createdById: 'synthetic-test-operator' } })
    createdCoupons.push(coupon.id)
    // The only SQL interpolation is a generated Prisma CUID, validated before test-only DDL.
    expect(fixture.trainerUser).toMatch(/^[a-z0-9]+$/)
    await independent.$executeRawUnsafe(`ALTER TABLE notifications ADD CONSTRAINT trainr_integration_notification_failure CHECK ("userId" <> '${fixture.trainerUser}') NOT VALID`)
    try {
      await expect(reserve(0, '09:00', coupon.code)).rejects.toThrow()
      expect((await independent.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).currentUses).toBe(0)
      expect(await independent.booking.count({ where: { trainerProfileId: fixture.trainer } })).toBe(0)
    } finally {
      await independent.$executeRawUnsafe('ALTER TABLE notifications DROP CONSTRAINT trainr_integration_notification_failure')
    }
  })

  it('enforces active-attempt uniqueness and permits replacement after retirement', async () => {
    const booking = await reserve()
    const payment = await pendingPayment(booking.id)
    const one = await prisma.checkoutAttempt.create({ data: { paymentId: payment.id, sequence: 1, parameters: {} } })
    await expect(independent.checkoutAttempt.create({ data: { paymentId: payment.id, sequence: 2, parameters: {} } })).rejects.toMatchObject({ code: 'P2002' })
    await prisma.checkoutAttempt.update({ where: { id: one.id }, data: { retiredAt: new Date() } })
    await expect(independent.checkoutAttempt.create({ data: { paymentId: payment.id, sequence: 2, parameters: {} } })).resolves.toMatchObject({ sequence: 2 })
  })

  it('shares one durable checkout attempt across concurrent requests', async () => {
    const booking = await reserve()
    const buyer = { id: fixture.parent, email: 'parent@example.test' }
    await Promise.all([0, 1, 2].map(() => startOrResumeCheckout(booking.id, buyer, 'acct_synthetic')))
    const payment = await independent.payment.findUniqueOrThrow({ where: { bookingId: booking.id }, include: { checkoutAttempts: true } })
    expect(payment.checkoutAttempts).toHaveLength(1)
    expect(payment.stripeCheckoutSessionId).toBe(payment.checkoutAttempts[0].stripeCheckoutSessionId)
    expect(new Set(provider.create.mock.calls.map((call) => call[1].idempotencyKey)).size).toBe(1)
  })

  it('commits duplicate settlement only once and preserves refund precedence', async () => {
    const booking = await reserve()
    const payment = await pendingPayment(booking.id)
    const evidence = { bookingId: booking.id, paymentId: payment.id, intentId: `pi_${randomUUID()}`, amount: 6000, currency: 'usd', outcome: 'paid' as const }
    await Promise.all([applyPaymentEvidence(evidence), applyPaymentEvidence(evidence)])
    expect((await independent.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('CONFIRMED')
    expect(await independent.notification.count({ where: { userId: fixture.parent, type: 'BOOKING_CONFIRMED' } })).toBe(1)
    await Promise.all([applyPaymentEvidence({ ...evidence, outcome: 'refunded', refundAmount: 6000 }), applyPaymentEvidence(evidence)])
    expect((await independent.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe('REFUNDED')
    expect((await independent.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('CANCELLED')
  })

  it('does not reopen a cancelled booking on late payment', async () => {
    const booking = await reserve()
    const payment = await pendingPayment(booking.id)
    await applyBookingAction(booking.id, { id: fixture.parent, role: 'PARENT' }, { action: 'cancel' })
    await applyPaymentEvidence({ bookingId: booking.id, paymentId: payment.id, intentId: `pi_${randomUUID()}`, amount: 6000, currency: 'usd', outcome: 'paid' })
    expect((await independent.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('CANCELLED')
    expect(await independent.notification.count({ where: { userId: fixture.parent, type: 'PAYMENT_REVIEW_REQUIRED' } })).toBe(1)
  })

  it('increments completion statistics once under concurrent retries', async () => {
    const booking = await reserve()
    await prisma.booking.update({ where: { id: booking.id }, data: { status: 'CONFIRMED' } })
    const payment = await pendingPayment(booking.id)
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'SUCCEEDED' } })
    const actor = { id: fixture.trainerUser, role: 'TRAINER' }
    await Promise.all([applyBookingAction(booking.id, actor, { action: 'complete' }), applyBookingAction(booking.id, actor, { action: 'complete' })])
    expect((await independent.trainerProfile.findUniqueOrThrow({ where: { id: fixture.trainer } })).totalSessions).toBe(1)
  })
})
