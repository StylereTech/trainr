import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// This suite isolates state transitions. stripe-settlement suites exercise the real verifier and provider receipt chain.
vi.mock('@/lib/stripe-settlement', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/stripe-settlement')>(),
  verifyDestinationSettlement: async (booking: any, _attempt: unknown, _intent: string, charge?: string | null) => ({
    chargeId: charge || booking.payment.stripeChargeId || 'ch_synthetic',
    transferId: 'tr_synthetic', hasRefunds: false, requiresReview: false,
  }),
}))
import { PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createBooking } from '@/lib/booking-creation'
import { applyBookingAction } from '@/lib/booking-actions'
import { applyPaymentEvidence } from '@/lib/stripe-payment-events'
import { closeCancelledCheckout, startOrResumeCheckout } from '@/lib/checkout-attempts'
import { defaultFeeValues, updateFeeConfiguration } from '@/lib/fee-config'
import { saveTrainerCertifications } from '@/lib/trainer-certifications'
import { GET as getTrainerProfile, PUT as putTrainerProfile } from '@/app/api/trainer/onboarding/route'
import { GET as browseTrainers } from '@/app/api/trainers/route'
import { GET as searchTrainers } from '@/app/api/search/route'
import { getPublicTrainerBySlug } from '@/lib/trainer-detail'
import { applyTrainerAdminAction } from '@/lib/trainer-admin-actions'
import { PATCH as patchTrainerDecision } from '@/app/api/admin/trainers/[id]/route'
import { readDashboardBookings } from '@/lib/dashboard-bookings'
import { dashboardResponseSchema } from '@/lib/dashboard-contract'
import { ensureConnectAccount } from '@/lib/connect-accounts'

// Stripe and route authentication are simulated. Prisma transactions, constraints and row locks are real.
const provider = vi.hoisted(() => ({ create: vi.fn(), retrieve: vi.fn(), expire: vi.fn(), intent: vi.fn() }))
const auth = vi.hoisted(() => ({ session: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getServerSession: auth.session, authOptions: {} }))
vi.mock('@/lib/stripe', () => ({ stripe: { checkout: { sessions: { create: provider.create, retrieve: provider.retrieve, expire: provider.expire } }, paymentIntents: { retrieve: provider.intent } } }))
vi.mock('@/lib/app-url', () => ({ toAbsoluteAppUrl: (path: string) => `http://localhost:3107${path}` }))
const independent = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL })
let fixture: { parent: string; trainerUser: string; trainer: string; service: string; sport: string; athletes: string[]; date: string }
const createdParents: string[] = []
const createdTrainers: string[] = []
const createdCoupons: string[] = []
const createdConfigs: string[] = []
const createdSports: string[] = []
const createdAdmins: string[] = []
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
  provider.expire.mockImplementation(async (id) => {
    const session = Array.from(sessions.values()).find((value) => value.id === id)
    if (!session || session.status !== 'open') throw new Error('not open')
    Object.assign(session, { status: 'expired', url: null })
    return session
  })
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
  await prisma.review.deleteMany({ where: { trainerProfile: { userId: { in: createdTrainers } } } })
  await prisma.booking.deleteMany({ where: { trainerProfile: { userId: { in: createdTrainers } } } })
  await prisma.coupon.deleteMany({ where: { id: { in: createdCoupons } } })
  await prisma.adminAction.deleteMany({ where: { adminUserId: { in: createdAdmins } } })
  await prisma.user.deleteMany({ where: { id: { in: [...createdParents, ...createdTrainers, ...createdAdmins] } } })
  await prisma.sport.deleteMany({ where: { id: { in: createdSports } } })
  await Promise.all([prisma.$disconnect(), independent.$disconnect()])
})

const reserve = (athlete = 0, startTime = '09:00', couponCode?: string) => createBooking(fixture.parent, {
  requestId: randomUUID(),
  serviceOfferingId: fixture.service, athleteProfileId: fixture.athletes[athlete], date: fixture.date, startTime, couponCode,
})
async function pendingPayment(bookingId: string) {
  return prisma.payment.create({ data: { bookingId, amountInCents: 6000, platformFeeInCents: 900, trainerPayoutInCents: 5100 } })
}

describe('real PostgreSQL money-flow persistence', () => {
  it.each(['role', 'deactivation'] as const)('blocks queued checkout before any provider write when buyer %s wins', async change => {
    const booking = await reserve()
    let release!: () => void
    let ready!: (pid: number) => void
    const locked = new Promise<number>(resolve => { ready = resolve })
    const hold = independent.$transaction(async tx => {
      const [backend] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${fixture.parent} FOR UPDATE`
      const untilReleased = new Promise<void>(resolve => { release = resolve })
      ready(backend.pid); await untilReleased
      await tx.user.update({ where: { id: fixture.parent }, data: change === 'role' ? { role: 'TRAINER' } : { deletedAt: new Date() } })
    }, { timeout: 15000 })
    const holder = await locked
    const checkout = startOrResumeCheckout(booking.id, { id: fixture.parent }, 'acct_synthetic')
      .then(value => ({ value, error: null }), error => ({ value: null, error }))
    let result: Awaited<typeof checkout>
    try {
      await expect.poll(async () => {
        const [waiting] = await independent.$queryRaw<Array<{ count: number }>>`SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE ${holder} = ANY(pg_blocking_pids(pid)) AND wait_event_type = 'Lock'`
        return waiting.count
      }, { timeout: 3000 }).toBeGreaterThan(0)
    } finally { release(); await hold; result = await checkout }
    expect(result.error).toMatchObject({ message: expect.stringContaining('Parent access') })
    expect(result.value).toBeNull()
    expect(await independent.payment.count({ where: { bookingId: booking.id } })).toBe(0)
    expect(provider.create).not.toHaveBeenCalled()
    expect(provider.retrieve).not.toHaveBeenCalled()
  })

  it.each([
    ['create', 'role'], ['create', 'deactivation'], ['retrieve', 'role'], ['retrieve', 'deactivation'],
  ] as const)('withholds checkout after buyer %s response crosses a %s commit', async (operation, change) => {
    const booking = await reserve()
    const buyer = { id: fixture.parent }
    if (operation === 'retrieve') await startOrResumeCheckout(booking.id, buyer, 'acct_synthetic')
    const readSession = provider.retrieve.getMockImplementation()!
    const original = provider[operation].getMockImplementation()!
    provider[operation].mockImplementationOnce(async (...args) => {
      const session = await original(...args)
      // This independent write also proves no buyer lock is held across the external request.
      await independent.user.update({ where: { id: fixture.parent }, data: change === 'role' ? { role: 'TRAINER' } : { deletedAt: new Date() } })
      return session
    })
    await expect(startOrResumeCheckout(booking.id, buyer, 'acct_synthetic')).rejects.toThrow('Parent account access changed')
    const payment = await independent.payment.findUniqueOrThrow({ where: { bookingId: booking.id }, include: { checkoutAttempts: true } })
    expect(payment.stripeCheckoutSessionId).toBeTruthy()
    expect(payment.checkoutAttempts).toHaveLength(1)
    expect(payment.checkoutAttempts[0].stripeCheckoutSessionId).toBe(payment.stripeCheckoutSessionId)
    expect(payment.checkoutAttempts[0].retiredAt).toBeNull()
    expect(payment.status).toBe('PENDING')
    expect((await independent.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('PENDING')
    expect(await readSession(payment.stripeCheckoutSessionId)).toMatchObject({ status: 'expired' })
    expect(provider.create).toHaveBeenCalledTimes(1)
    const reads = provider.retrieve.mock.calls.length
    await expect(startOrResumeCheckout(booking.id, buyer, 'acct_synthetic')).rejects.toThrow('Parent access')
    expect(provider.create).toHaveBeenCalledTimes(1)
    expect(provider.retrieve).toHaveBeenCalledTimes(reads)
  })

  it('keeps uncertain withheld checkout traceable for authorized cancellation and closure', async () => {
    const booking = await reserve()
    const create = provider.create.getMockImplementation()!, expire = provider.expire.getMockImplementation()!
    provider.create.mockImplementationOnce(async (...args) => {
      const session = await create(...args)
      await independent.user.update({ where: { id: fixture.parent }, data: { deletedAt: new Date() } })
      return session
    })
    provider.expire.mockRejectedValueOnce(new Error('Synthetic provider outage'))
    await expect(startOrResumeCheckout(booking.id, { id: fixture.parent }, 'acct_synthetic')).rejects.toThrow('contact support to reconcile')
    const payment = await independent.payment.findUniqueOrThrow({ where: { bookingId: booking.id } })
    expect(payment.stripeCheckoutSessionId).toBeTruthy()
    expect(payment.status).toBe('PENDING')
    expect(await provider.retrieve(payment.stripeCheckoutSessionId)).toMatchObject({ status: 'open' })
    provider.expire.mockImplementation(expire)
    await applyBookingAction(booking.id, { id: fixture.trainerUser, role: 'TRAINER' }, { action: 'cancel', reason: 'Synthetic reconciliation decision' })
    expect(await closeCancelledCheckout(booking.id)).toBe('closed')
    expect((await independent.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe('PENDING')
    expect(provider.create).toHaveBeenCalledTimes(1)
    expect(await independent.checkoutAttempt.count({ where: { paymentId: payment.id } })).toBe(1)
  })

  it.each([
    ['PARENT', 'role'], ['TRAINER', 'role'], ['ADMIN', 'role'],
    ['PARENT', 'deactivation'], ['TRAINER', 'deactivation'], ['ADMIN', 'deactivation'],
  ] as const)('denies a queued %s booking mutation after %s commits', async (role, change) => {
    const booking = await reserve()
    await prisma.booking.update({ where: { id: booking.id }, data: { status: 'CONFIRMED' } })
    const payment = await pendingPayment(booking.id)
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'SUCCEEDED' } })
    let actorId = role === 'PARENT' ? fixture.parent : fixture.trainerUser
    if (role === 'ADMIN') {
      const admin = await prisma.user.create({ data: { email: `booking-admin-${randomUUID()}@example.test`, role: 'ADMIN', passwordHash: 'not-a-login' } })
      actorId = admin.id; createdAdmins.push(admin.id)
    }
    const audience = [fixture.parent, fixture.trainerUser, actorId]
    const notices = await independent.notification.count({ where: { userId: { in: audience } } })
    let release!: () => void
    let ready!: (pid: number) => void
    const locked = new Promise<number>(resolve => { ready = resolve })
    const hold = independent.$transaction(async tx => {
      const [backend] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${actorId} FOR UPDATE`
      const untilReleased = new Promise<void>(resolve => { release = resolve })
      ready(backend.pid)
      await untilReleased
      await tx.user.update({ where: { id: actorId }, data: change === 'deactivation'
        ? { deletedAt: new Date(), sessionVersion: { increment: 1 } }
        : { role: role === 'PARENT' ? 'TRAINER' : 'PARENT', sessionVersion: { increment: 1 } } })
    }, { timeout: 15000 })
    const holder = await locked
    const action = applyBookingAction(booking.id, { id: actorId, role }, { action: role === 'PARENT' ? 'cancel' : 'complete' })
      .then(value => ({ value, error: null }), error => ({ value: null, error }))
    let outcome: Awaited<typeof action>
    try {
      await expect.poll(async () => {
        const [waiting] = await independent.$queryRaw<Array<{ count: number }>>`SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE ${holder} = ANY(pg_blocking_pids(pid)) AND wait_event_type = 'Lock'`
        return waiting.count
      }, { timeout: 3000 }).toBeGreaterThan(0)
    } finally { release(); await hold; outcome = await action }
    expect(outcome.error).toMatchObject({ status: 403 })
    expect(outcome.value).toBeNull()
    expect((await independent.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('CONFIRMED')
    expect((await independent.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe('SUCCEEDED')
    expect((await independent.trainerProfile.findUniqueOrThrow({ where: { id: fixture.trainer } })).totalSessions).toBe(0)
    expect(await independent.notification.count({ where: { userId: { in: audience } } })).toBe(notices)
    expect(await independent.adminAction.count({ where: { targetId: booking.id } })).toBe(0)
  })

  it('lets an authorized action commit before a later revocation, then denies its retry', async () => {
    const booking = await reserve()
    await prisma.booking.update({ where: { id: booking.id }, data: { status: 'CONFIRMED' } })
    const payment = await pendingPayment(booking.id)
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'SUCCEEDED' } })
    let release!: () => void
    let ready!: (pid: number) => void
    const locked = new Promise<number>(resolve => { ready = resolve })
    const hold = independent.$transaction(async tx => {
      const [backend] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`
      await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${booking.id} FOR UPDATE`
      const untilReleased = new Promise<void>(resolve => { release = resolve })
      ready(backend.pid); await untilReleased
    }, { timeout: 15000 })
    const holder = await locked
    const actor = { id: fixture.trainerUser, role: 'TRAINER' }
    const action = applyBookingAction(booking.id, actor, { action: 'complete' })
      .then(value => ({ value, error: null }), error => ({ value: null, error }))
    let revocation: Promise<unknown> | undefined
    let outcome: Awaited<typeof action>
    try {
      await expect.poll(async () => {
        const rows = await independent.$queryRaw<Array<{ pid: number }>>`SELECT pid FROM pg_stat_activity WHERE ${holder} = ANY(pg_blocking_pids(pid)) AND wait_event_type = 'Lock'`
        return rows[0]?.pid || 0
      }, { timeout: 3000 }).toBeGreaterThan(0)
      const [waiting] = await independent.$queryRaw<Array<{ pid: number }>>`SELECT pid FROM pg_stat_activity WHERE ${holder} = ANY(pg_blocking_pids(pid)) AND wait_event_type = 'Lock'`
      revocation = independent.user.update({ where: { id: actor.id }, data: { role: 'PARENT', sessionVersion: { increment: 1 } } }).then(value => value)
      await expect.poll(async () => {
        const [blocked] = await independent.$queryRaw<Array<{ count: number }>>`SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE ${waiting.pid} = ANY(pg_blocking_pids(pid)) AND wait_event_type = 'Lock'`
        return blocked.count
      }, { timeout: 3000 }).toBeGreaterThan(0)
    } finally { release(); await hold; outcome = await action; await revocation }
    expect(outcome.error).toBeNull()
    expect(outcome.value).toMatchObject({ status: 'COMPLETED' })
    await expect(applyBookingAction(booking.id, actor, { action: 'complete' })).rejects.toMatchObject({ status: 403 })
    expect((await independent.trainerProfile.findUniqueOrThrow({ where: { id: fixture.trainer } })).totalSessions).toBe(1)
    expect(await independent.notification.count({ where: { userId: fixture.parent, type: 'SESSION_COMPLETED' } })).toBe(1)
  })

  it('expires saved checkout after cancellation and repeats without duplicate notices or replacement', async () => {
    const booking = await reserve()
    const result = await startOrResumeCheckout(booking.id, { id: fixture.parent }, 'acct_synthetic')
    await applyBookingAction(booking.id, { id: fixture.parent, role: 'PARENT' }, { action: 'cancel' })
    const notices = await prisma.notification.count({ where: { userId: { in: [fixture.parent, fixture.trainerUser] } } })
    expect(await closeCancelledCheckout(booking.id)).toBe('closed')
    await applyBookingAction(booking.id, { id: fixture.parent, role: 'PARENT' }, { action: 'cancel' })
    expect(await closeCancelledCheckout(booking.id)).toBe('closed')
    const stored = await independent.payment.findUniqueOrThrow({ where: { id: result.paymentId }, include: { checkoutAttempts: true, booking: true } })
    expect(stored.checkoutAttempts).toHaveLength(1)
    expect(stored.booking.status).toBe('CANCELLED')
    expect(stored.status).toBe('PENDING')
    expect(stored.stripeCheckoutSessionId).toBe(stored.checkoutAttempts[0].stripeCheckoutSessionId)
    expect(provider.expire).toHaveBeenCalledTimes(1)
    expect(await prisma.notification.count({ where: { userId: { in: [fixture.parent, fixture.trainerUser] } } })).toBe(notices)
  })
  it('recovers and expires the original creation after an ambiguous provider response', async () => {
    const booking = await reserve()
    const create = provider.create.getMockImplementation()!
    provider.create.mockImplementationOnce(async (...args) => { await create(...args); throw new Error('lost create response') })
    await expect(startOrResumeCheckout(booking.id, { id: fixture.parent }, 'acct_synthetic')).rejects.toThrow('lost create')
    await applyBookingAction(booking.id, { id: fixture.parent, role: 'PARENT' }, { action: 'cancel' })
    expect(await closeCancelledCheckout(booking.id)).toBe('closed')
    expect(provider.create.mock.calls[0][1].idempotencyKey).toBe(provider.create.mock.calls[1][1].idempotencyKey)
    const payment = await independent.payment.findUniqueOrThrow({ where: { bookingId: booking.id }, include: { checkoutAttempts: true } })
    expect(payment.checkoutAttempts).toHaveLength(1)
    expect(payment.stripeCheckoutSessionId).toBeTruthy()
    expect((await provider.retrieve(payment.stripeCheckoutSessionId)).status).toBe('expired')
  })
  it('retains and closes the provider identity if cancellation commits while creation is in flight', async () => {
    const booking = await reserve()
    const create = provider.create.getMockImplementation()!
    provider.create.mockImplementationOnce(async (...args) => {
      const session = await create(...args)
      await applyBookingAction(booking.id, { id: fixture.parent, role: 'PARENT' }, { action: 'cancel' })
      return session
    })
    await expect(startOrResumeCheckout(booking.id, { id: fixture.parent }, 'acct_synthetic')).rejects.toThrow('cannot be paid')
    const payment = await independent.payment.findUniqueOrThrow({ where: { bookingId: booking.id } })
    expect(payment.stripeCheckoutSessionId).toBeTruthy()
    expect((await provider.retrieve(payment.stripeCheckoutSessionId)).status).toBe('expired')
    expect((await independent.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('CANCELLED')
  })
  it('keeps cancellation committed through an expire outage and recovers on retry', async () => {
    const booking = await reserve()
    await startOrResumeCheckout(booking.id, { id: fixture.parent }, 'acct_synthetic')
    await applyBookingAction(booking.id, { id: fixture.trainerUser, role: 'TRAINER' }, { action: 'cancel' })
    provider.expire.mockRejectedValueOnce(new Error('synthetic outage'))
    expect(await closeCancelledCheckout(booking.id)).toBe('review_required')
    expect((await independent.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('CANCELLED')
    expect(await closeCancelledCheckout(booking.id)).toBe('closed')
  })
  it('reconciles payment winning the expire race without reopening the reservation', async () => {
    const booking = await reserve()
    await startOrResumeCheckout(booking.id, { id: fixture.parent }, 'acct_synthetic')
    await applyBookingAction(booking.id, { id: fixture.parent, role: 'PARENT' }, { action: 'cancel' })
    provider.expire.mockImplementationOnce(async id => {
      const session = await provider.retrieve(id)
      Object.assign(session, { status: 'complete', payment_status: 'paid', payment_intent: `pi_${randomUUID()}` })
      throw new Error('already completed')
    })
    expect(await closeCancelledCheckout(booking.id)).toBe('review_required')
    const stored = await independent.booking.findUniqueOrThrow({ where: { id: booking.id }, include: { payment: true } })
    expect(stored.status).toBe('CANCELLED')
    expect(stored.payment?.status).toBe('SUCCEEDED')
    expect(stored.payment?.refundAmountInCents).toBe(0)
  })
  it('does not report closed using money state read before a concurrent webhook', async () => {
    const booking = await reserve()
    const { paymentId } = await startOrResumeCheckout(booking.id, { id: fixture.parent }, 'acct_synthetic')
    await applyBookingAction(booking.id, { id: fixture.parent, role: 'PARENT' }, { action: 'cancel' })
    const expire = provider.expire.getMockImplementation()!
    provider.expire.mockImplementationOnce(async (...args) => {
      const session = await expire(...args)
      await applyPaymentEvidence({ bookingId: booking.id, paymentId, sessionId: session.id, intentId: `pi_${randomUUID()}`, amount: 6000, currency: 'usd', outcome: 'paid' })
      return session
    })
    expect(await closeCancelledCheckout(booking.id)).toBe('review_required')
    expect((await independent.payment.findUniqueOrThrow({ where: { id: paymentId } })).status).toBe('SUCCEEDED')
  })
  it.each(['paid', 'checkout-attempt'])('does not initialize a replacement for an unlinked trainer with %s history', async kind => {
    const booking = await reserve()
    const payment = await pendingPayment(booking.id)
    if (kind === 'paid') await prisma.payment.update({ where: { id: payment.id }, data: { status: 'SUCCEEDED' } })
    else await prisma.checkoutAttempt.create({ data: { paymentId: payment.id, sequence: 1, parameters: {} } })
    await prisma.trainerProfile.update({ where: { id: fixture.trainer }, data: { stripeAccountId: null } })
    await expect(ensureConnectAccount(fixture.trainerUser)).rejects.toThrow('Existing payment history')
    expect(await prisma.connectAccountAttempt.count({ where: { trainerProfileId: fixture.trainer } })).toBe(0)
  })
  async function dashboardRows() {
    const parent = await prisma.parentProfile.findUniqueOrThrow({ where: { userId: fixture.parent } })
    const statuses = [...Array(12).fill('PENDING'), ...Array(13).fill('CONFIRMED'), ...Array(8).fill('COMPLETED'), 'CANCELLED', 'NO_SHOW', 'RESCHEDULED'] as Array<'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW' | 'RESCHEDULED'>
    await prisma.booking.createMany({ data: statuses.map((status, index) => ({ parentProfileId: parent.id, trainerProfileId: fixture.trainer, athleteProfileId: fixture.athletes[0], serviceOfferingId: fixture.service,
      date: new Date(Date.UTC(2030, 10, index + 1)), startTime: '09:00', endTime: '10:00', status, totalAmountInCents: 6000, platformFeeInCents: 900, trainerPayoutInCents: 5100 })) })
  }
  it('counts all owned bookings independently of parent page and includes rescheduled history', async () => {
    await dashboardRows()
    const actor = { id: fixture.parent, role: 'PARENT' }
    const first = await readDashboardBookings(actor, 'upcoming', 1, 10)
    const last = await readDashboardBookings(actor, 'upcoming', 3, 10)
    expect(first.counts).toEqual({ PENDING: 12, CONFIRMED: 13, COMPLETED: 8, CANCELLED: 1, NO_SHOW: 1, RESCHEDULED: 1 })
    expect(first.bookings).toHaveLength(10)
    expect(last.bookings).toHaveLength(5)
    expect(last.pagination).toEqual({ page: 3, total: 25, totalPages: 3, limit: 10 })
    expect(first.reviewsToLeave).toBe(8)
    expect(first.bookings.some(row => last.bookings.some(other => row.id === other.id))).toBe(false)
    expect(first.bookings[0].date.getTime()).toBeLessThan(last.bookings[0].date.getTime())
    const past = await readDashboardBookings(actor, 'past', 1, 10)
    expect(past.pagination.total).toBe(11)
    expect(past.bookings[0].status).toBe('RESCHEDULED')
    expect(dashboardResponseSchema.safeParse(JSON.parse(JSON.stringify(past))).success).toBe(true)
  })
  it('counts trainer views across all pages without returning other accounts or provider identifiers', async () => {
    await dashboardRows()
    const result = await readDashboardBookings({ id: fixture.trainerUser, role: 'TRAINER' }, 'all', 1, 10)
    expect(result.pagination.total).toBe(36)
    expect(result.reviewsToLeave).toBe(0)
    expect(result.bookings.every(row => row.athleteProfile.lastName === 'Athlete 0')).toBe(true)
    for (const row of result.bookings) {
      expect(Object.keys(row.trainerProfile).sort()).toEqual(['firstName', 'lastName', 'paymentReady'])
      expect(row.parentProfile.user).not.toHaveProperty('passwordHash')
      expect(row.athleteProfile).not.toHaveProperty('dateOfBirth')
    }
    expect(JSON.stringify(result)).not.toContain('acct_synthetic')
  })
  it('clamps an emptied last page and returns a true empty account without invented counts', async () => {
    const empty = await readDashboardBookings({ id: fixture.parent, role: 'PARENT' }, 'past', 999, 10)
    expect(empty.pagination).toEqual({ page: 1, total: 0, totalPages: 0, limit: 10 })
    await dashboardRows()
    const result = await readDashboardBookings({ id: fixture.trainerUser, role: 'TRAINER' }, 'pending', 99, 10)
    expect(result.pagination.page).toBe(2)
    expect(result.bookings).toHaveLength(2)
    await prisma.booking.updateMany({ where: { id: { in: result.bookings.map(row => row.id) } }, data: { status: 'CONFIRMED' } })
    const refreshed = await readDashboardBookings({ id: fixture.trainerUser, role: 'TRAINER' }, 'pending', 2, 10)
    expect(refreshed.pagination.page).toBe(1)
    expect(refreshed.counts).toMatchObject({ PENDING: 10, CONFIRMED: 15 })
  })
  it('returns persisted refund distinctions without provider identities or invented earnings', async () => {
    const booking = await reserve()
    const paid = await pendingPayment(booking.id)
    await prisma.payment.update({ where: { id: paid.id }, data: { status: 'PARTIALLY_REFUNDED', refundAmountInCents: 1000, refundPendingAmountInCents: 2000, refundFailedCount: 1, refundsVerifiedAt: new Date(), stripePaymentIntentId: 'pi_private' } })
    const result = await readDashboardBookings({ id: fixture.parent, role: 'PARENT' }, 'upcoming', 1, 10)
    expect(result.bookings[0].payment).toMatchObject({ refundAmountInCents: 1000, refundPendingAmountInCents: 2000, refundFailedCount: 1, refundsVerifiedAt: expect.any(Date) })
    expect(JSON.stringify(result)).not.toContain('pi_private')
    expect(result).not.toHaveProperty('totalEarnings')
  })
  it.each([{ role: 'ADMIN', view: 'all', code: 403 }, { role: 'PARENT', view: 'all', code: 400 }, { role: 'TRAINER', view: 'past', code: 400 }, { role: 'PARENT', view: 'upcoming', code: 404 }])('denies unauthorized/mismatched dashboard %j', async scenario => {
    await expect(readDashboardBookings({ id: 'missing-profile', role: scenario.role }, scenario.view as any, 1, 10)).rejects.toMatchObject({ status: scenario.code })
  })
  async function reviewFixture() {
    const admin = await prisma.user.create({ data: { email: `${randomUUID()}-admin@example.test`, passwordHash: 'not-a-login', role: 'ADMIN' } })
    createdAdmins.push(admin.id)
    const trainer = await prisma.trainerProfile.update({ where: { id: fixture.trainer }, data: { approvalStatus: 'PENDING', approvedAt: null } })
    auth.session.mockResolvedValue({ user: { id: admin.id, role: 'ADMIN' } })
    return { admin: admin.id, revision: trainer.updatedAt.toISOString() }
  }

  it('commits approval, audit and notification through the actual route before allowing a reservation', async () => {
    const review = await reviewFixture()
    await expect(reserve()).rejects.toMatchObject({ status: 409 })
    const response = await patchTrainerDecision(new Request('http://localhost/api/admin/trainers/fixture', {
      method: 'PATCH', body: JSON.stringify({ action: 'approve', revision: review.revision }),
    }) as any, { params: Promise.resolve({ id: fixture.trainer }) })
    expect(response.status).toBe(200)
    const trainer = await independent.trainerProfile.findUniqueOrThrow({ where: { id: fixture.trainer } })
    expect(trainer.approvalStatus).toBe('APPROVED')
    expect(trainer.approvedAt).not.toBeNull()
    expect(trainer.updatedAt.toISOString()).not.toBe(review.revision)
    expect(await independent.adminAction.count({ where: { adminUserId: review.admin, targetId: fixture.trainer } })).toBe(1)
    expect(await independent.notification.count({ where: { userId: fixture.trainerUser, type: 'TRAINER_APPROVE' } })).toBe(1)
    await expect(reserve()).resolves.toMatchObject({ status: 'PENDING' })
  })

  it.each(['audit', 'notification'] as const)('rolls approval back when the actual %s constraint rejects the write, then retries cleanly', async failure => {
    const review = await reviewFixture()
    const table = failure === 'audit' ? 'admin_actions' : 'notifications'
    const column = failure === 'audit' ? 'targetId' : 'userId'
    const value = failure === 'audit' ? fixture.trainer : fixture.trainerUser
    await independent.$executeRawUnsafe(`ALTER TABLE ${table} ADD CONSTRAINT trainr_integration_approval_failure CHECK ("${column}" <> '${value}') NOT VALID`)
    try {
      await expect(applyTrainerAdminAction(fixture.trainer, review.admin, { action: 'approve', revision: review.revision })).rejects.toThrow()
      expect(await independent.trainerProfile.findUniqueOrThrow({ where: { id: fixture.trainer } })).toMatchObject({ approvalStatus: 'PENDING', approvedAt: null, updatedAt: new Date(review.revision) })
      expect(await independent.adminAction.count({ where: { adminUserId: review.admin } })).toBe(0)
      expect(await independent.notification.count({ where: { userId: fixture.trainerUser } })).toBe(0)
      await expect(reserve()).rejects.toMatchObject({ status: 409 })
    } finally {
      await independent.$executeRawUnsafe(`ALTER TABLE ${table} DROP CONSTRAINT trainr_integration_approval_failure`)
    }
    await applyTrainerAdminAction(fixture.trainer, review.admin, { action: 'approve', revision: review.revision })
    expect(await independent.adminAction.count({ where: { adminUserId: review.admin } })).toBe(1)
    expect(await independent.notification.count({ where: { userId: fixture.trainerUser } })).toBe(1)
  })

  it('serializes competing real approval decisions and rejects the stale reviewer', async () => {
    const review = await reviewFixture()
    const results = await Promise.allSettled([
      applyTrainerAdminAction(fixture.trainer, review.admin, { action: 'approve', revision: review.revision }),
      applyTrainerAdminAction(fixture.trainer, review.admin, { action: 'reject', reason: 'Missing details', revision: review.revision }),
    ])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { status: 409 } })
    expect(await independent.adminAction.count({ where: { adminUserId: review.admin } })).toBe(1)
    expect(await independent.notification.count({ where: { userId: fixture.trainerUser } })).toBe(1)
  })

  it('rejects a trainer edited after review without approving the newer content', async () => {
    const review = await reviewFixture()
    await independent.trainerProfile.update({ where: { id: fixture.trainer }, data: { headline: 'New content after review', updatedAt: new Date(Date.parse(review.revision) + 1000) } })
    await expect(applyTrainerAdminAction(fixture.trainer, review.admin, { action: 'approve', revision: review.revision })).rejects.toMatchObject({ status: 409 })
    expect((await independent.trainerProfile.findUniqueOrThrow({ where: { id: fixture.trainer } })).approvalStatus).toBe('PENDING')
    expect(await independent.adminAction.count({ where: { adminUserId: review.admin } })).toBe(0)
  })

  it('rejects an admin token after its actual database role is revoked', async () => {
    const review = await reviewFixture()
    await independent.user.update({ where: { id: review.admin }, data: { role: 'PARENT' } })
    const response = await patchTrainerDecision(new Request('http://localhost/api/admin/trainers/fixture', {
      method: 'PATCH', body: JSON.stringify({ action: 'approve', revision: review.revision }),
    }) as any, { params: Promise.resolve({ id: fixture.trainer }) })
    expect(response.status).toBe(403)
    expect((await independent.trainerProfile.findUniqueOrThrow({ where: { id: fixture.trainer } })).approvalStatus).toBe('PENDING')
    expect(await independent.adminAction.count({ where: { adminUserId: review.admin } })).toBe(0)
  })

  it.each(['suspend', 'deactivate'] as const)('%s prevents new reservations without silently cancelling existing bookings', async decision => {
    const review = await reviewFixture()
    const approved = await applyTrainerAdminAction(fixture.trainer, review.admin, { action: 'approve', revision: review.revision })
    const existing = await reserve()
    const revision = approved.updatedAt.toISOString()
    await applyTrainerAdminAction(fixture.trainer, review.admin, decision === 'suspend'
      ? { action: 'suspend', revision, reason: 'Synthetic review hold' }
      : { action: 'toggle_active', revision, isActive: false })
    await expect(reserve(1, '10:00')).rejects.toMatchObject({ status: 409 })
    await expect(startOrResumeCheckout(existing.id, { id: fixture.parent }, 'acct_synthetic')).rejects.toThrow('not available for checkout')
    expect(await independent.payment.count({ where: { bookingId: existing.id } })).toBe(0)
    expect(provider.create).not.toHaveBeenCalled()
    expect(await independent.booking.count({ where: { trainerProfileId: fixture.trainer } })).toBe(1)
    expect((await independent.booking.findUniqueOrThrow({ where: { id: existing.id } })).status).toBe('PENDING')
  })

  it('does not return a previously saved checkout URL after suspension', async () => {
    const review = await reviewFixture()
    const approved = await applyTrainerAdminAction(fixture.trainer, review.admin, { action: 'approve', revision: review.revision })
    const booking = await reserve()
    await startOrResumeCheckout(booking.id, { id: fixture.parent }, 'acct_synthetic')
    const before = await independent.payment.findUniqueOrThrow({ where: { bookingId: booking.id } })
    await applyTrainerAdminAction(fixture.trainer, review.admin, { action: 'suspend', revision: approved.updatedAt.toISOString(), reason: 'Synthetic hold' })
    await expect(startOrResumeCheckout(booking.id, { id: fixture.parent }, 'acct_synthetic')).rejects.toThrow('not available for checkout')
    const after = await independent.payment.findUniqueOrThrow({ where: { bookingId: booking.id } })
    expect(after.stripeCheckoutSessionId).toBe(before.stripeCheckoutSessionId)
    expect(provider.create).toHaveBeenCalledTimes(1)
    expect(provider.retrieve).not.toHaveBeenCalled()
  })

  it.each(['suspend', 'deactivate'] as const)('retains provider identity after a concurrent %s and can still record later payment evidence', async decision => {
    const review = await reviewFixture()
    const approved = await applyTrainerAdminAction(fixture.trainer, review.admin, { action: 'approve', revision: review.revision })
    const booking = await reserve()
    const create = provider.create.getMockImplementation()!
    provider.create.mockImplementation(async (...args) => {
      const session = await create(...args)
      const revision = approved.updatedAt.toISOString()
      await applyTrainerAdminAction(fixture.trainer, review.admin, decision === 'suspend'
        ? { action: 'suspend', revision, reason: 'Synthetic hold during checkout' }
        : { action: 'toggle_active', revision, isActive: false })
      return session
    })
    await expect(startOrResumeCheckout(booking.id, { id: fixture.parent }, 'acct_synthetic')).rejects.toThrow('no longer available')
    const payment = await independent.payment.findUniqueOrThrow({ where: { bookingId: booking.id } })
    const attempt = await independent.checkoutAttempt.findFirstOrThrow({ where: { paymentId: payment.id } })
    expect(payment.stripeCheckoutSessionId).toBeTruthy()
    expect(attempt.stripeCheckoutSessionId).toBe(payment.stripeCheckoutSessionId)
    expect(payment.status).toBe('PENDING')
    expect(provider.create).toHaveBeenCalledTimes(1)
    await applyPaymentEvidence({ bookingId: booking.id, paymentId: payment.id, attemptId: attempt.id,
      sessionId: payment.stripeCheckoutSessionId!, intentId: 'pi_synthetic_late_payment', amount: 6000, currency: 'usd', outcome: 'paid' })
    expect((await independent.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe('SUCCEEDED')
    expect(await independent.trainerProfile.findUniqueOrThrow({ where: { id: fixture.trainer } })).toMatchObject(decision === 'suspend' ? { approvalStatus: 'SUSPENDED' } : { isActive: false })
  })

  it('keeps populated private trainer and parent fields out of actual public query responses', async () => {
    const city = `audit-${randomUUID()}`
    const trainer = await prisma.trainerProfile.update({ where: { id: fixture.trainer }, data: {
      city, headline: 'Public headline', phone: 'private-phone-sentinel', address: 'private-address-sentinel',
      stripeAccountId: 'acct_private_sentinel', stripeOnboardingComplete: true, zipCode: 'private-zip',
      latitude: 12.345, longitude: 67.89, rejectedReason: 'private-note-sentinel', completionPercentage: 100,
    } })
    const booking = await reserve()
    await prisma.review.create({ data: { bookingId: booking.id, trainerProfileId: fixture.trainer, parentProfileId: booking.parentProfileId,
      rating: 5, knowledgeRating: 5, communicationRating: 5, punctualityRating: 5, comment: 'Public review', isPublished: true } })
    const owner = await independent.user.findUniqueOrThrow({ where: { id: fixture.parent } })
    for (const handler of [browseTrainers, searchTrainers]) {
      const response = await handler(new Request(`http://localhost/api/trainers?city=${city}&location=${city}`) as any)
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.trainers).toHaveLength(1)
      expect(body.trainers[0]).toMatchObject({ id: fixture.trainer, headline: 'Public headline', city })
      expect(body.trainers[0].serviceOfferings[0]).toMatchObject({ id: fixture.service, priceInCents: 6000 })
      for (const key of ['phone', 'address', 'stripeAccountId', 'stripeOnboardingComplete', 'userId', 'rejectedReason', 'zipCode', 'latitude', 'longitude', 'completionPercentage', '_count']) {
        expect(body.trainers[0]).not.toHaveProperty(key)
      }
      expect(JSON.stringify(body)).not.toContain('private-')
      expect(JSON.stringify(body)).not.toContain(owner.email)
      expect(body.trainers[0].sports[0]).not.toHaveProperty('trainerProfileId')
      expect(body.trainers[0].serviceOfferings[0]).not.toHaveProperty('trainerProfileId')
    }
    const detail = await getPublicTrainerBySlug(trainer.slug)
    expect(detail!.reviews[0]).toMatchObject({ comment: 'Public review', rating: 5 })
    expect(detail!.reviews[0]).not.toHaveProperty('parentProfile')
    expect(JSON.stringify(detail)).not.toContain(owner.email)
    expect(JSON.stringify(detail)).not.toContain('private-')
    expect(await independent.trainerProfile.findUniqueOrThrow({ where: { id: fixture.trainer } })).toMatchObject({ phone: 'private-phone-sentinel', address: 'private-address-sentinel' })
    await prisma.review.updateMany({ where: { trainerProfileId: fixture.trainer }, data: { isPublished: false } })
    const hidden = await getPublicTrainerBySlug(trainer.slug)
    expect(hidden!.reviews).toEqual([])
    expect(hidden!._count.reviews).toBe(0)
    await prisma.trainerProfile.update({ where: { id: fixture.trainer }, data: { isActive: false } })
    expect(await getPublicTrainerBySlug(trainer.slug)).toBeNull()
    for (const handler of [browseTrainers, searchTrainers]) {
      const body = await (await handler(new Request(`http://localhost/api/trainers?city=${city}&location=${city}`) as any)).json()
      expect(body.trainers).toEqual([])
      expect(body.pagination.total).toBe(0)
    }
  })
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
    // Refund reconciliation has its own provider/SQL suite; seed its established result here.
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'REFUNDED', refundAmountInCents: 6000 } })
    await prisma.booking.update({ where: { id: booking.id }, data: { status: 'CANCELLED' } })
    await applyPaymentEvidence(evidence)
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
