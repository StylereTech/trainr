import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createBooking } from '@/lib/booking-creation'
import { applyBookingAction } from '@/lib/booking-actions'
import { applyPaymentEvidence } from '@/lib/stripe-payment-events'
import { startOrResumeCheckout } from '@/lib/checkout-attempts'

// Only Stripe is simulated. Prisma transactions, constraints and row locks are real.
const provider = vi.hoisted(() => ({ create: vi.fn(), retrieve: vi.fn(), intent: vi.fn() }))
vi.mock('@/lib/stripe', () => ({ stripe: { checkout: { sessions: { create: provider.create, retrieve: provider.retrieve } }, paymentIntents: { retrieve: provider.intent } } }))
vi.mock('@/lib/app-url', () => ({ toAbsoluteAppUrl: (path: string) => `http://localhost:3107${path}` }))
const independent = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL })
let fixture: { parent: string; trainerUser: string; trainer: string; service: string; athletes: string[]; date: string }
const createdParents: string[] = []
const createdTrainers: string[] = []
const createdCoupons: string[] = []
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
  const parent = await prisma.user.create({ data: { email: `${id}-parent@example.test`, passwordHash: 'not-a-login', role: 'PARENT',
    parentProfile: { create: { athletes: { create: [0, 1, 2].map((n) => ({ firstName: 'Synthetic', lastName: `Athlete ${n}`, dateOfBirth: new Date('2015-01-01'), goals: [] })) } } } },
    include: { parentProfile: { include: { athletes: true } } } })
  createdParents.push(parent.id)
  const trainer = await prisma.user.create({ data: { email: `${id}-trainer@example.test`, passwordHash: 'not-a-login', role: 'TRAINER',
    trainerProfile: { create: { firstName: 'Synthetic', lastName: 'Trainer', slug: id, approvalStatus: 'APPROVED', stripeAccountId: 'acct_synthetic',
      serviceOfferings: { create: { title: 'Synthetic session', priceInCents: 6000, durationMinutes: 60 } },
      availabilitySlots: { create: { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' } } } } },
    include: { trainerProfile: { include: { serviceOfferings: true } } } })
  createdTrainers.push(trainer.id)
  fixture = { parent: parent.id, trainerUser: trainer.id, trainer: trainer.trainerProfile!.id,
    service: trainer.trainerProfile!.serviceOfferings[0].id, athletes: parent.parentProfile!.athletes.map((a) => a.id), date: '2030-11-04' }
  const sessions = new Map<string, any>()
  provider.create.mockImplementation(async (parameters, options) => {
    const key = options.idempotencyKey
    if (!sessions.has(key)) sessions.set(key, { id: `cs_${randomUUID()}`, status: 'open', payment_status: 'unpaid', payment_intent: null,
      mode: 'payment', currency: 'usd', amount_total: 6000, metadata: parameters.metadata, url: 'https://checkout.stripe.com/synthetic-only' })
    return sessions.get(key)
  })
  provider.retrieve.mockImplementation(async (id) => Array.from(sessions.values()).find((session) => session.id === id))
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
  await Promise.all([prisma.$disconnect(), independent.$disconnect()])
})

const reserve = (athlete = 0, startTime = '09:00', couponCode?: string) => createBooking(fixture.parent, {
  serviceOfferingId: fixture.service, athleteProfileId: fixture.athletes[athlete], date: fixture.date, startTime, couponCode,
})
async function pendingPayment(bookingId: string) {
  return prisma.payment.create({ data: { bookingId, amountInCents: 6000, platformFeeInCents: 900, trainerPayoutInCents: 5100 } })
}

describe('real PostgreSQL money-flow persistence', () => {
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
