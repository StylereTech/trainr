import { randomUUID } from 'node:crypto'
import Stripe from 'stripe'
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest'
import { Prisma, PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { applyPaymentEvidence } from '@/lib/stripe-payment-events'
import { startOrResumeCheckout } from '@/lib/checkout-attempts'
import { POST } from '@/app/api/payments/webhook/route'
import { settlementFixture, settlementDispute } from '../helpers/stripe-settlement-fixture'
import { changeNotifications, readNotifications } from '@/lib/notifications'
import { reconcileBookingPayment } from '@/lib/payment-reconciliation'
import { reconcilePaymentRefunds } from '@/lib/refund-reconciliation'
import { applyBookingAction } from '@/lib/booking-actions'
import { readDashboardBookings } from '@/lib/dashboard-bookings'

const provider = vi.hoisted(() => ({ intent: vi.fn(), charge: vi.fn(), transfer: vi.fn(), fee: vi.fn(), disputes: vi.fn(), refunds: vi.fn(), session: vi.fn(), signature: '' }))
const secret = 'whsec_synthetic_settlement_only'
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'stripe-signature': provider.signature }) }))
vi.mock('@/lib/stripe', async () => {
  const { default: SDK } = await import('stripe')
  return { stripeRuntimeStatus: () => ({ secretConfigured: true, webhookConfigured: true }),
    verifyWebhookSignature: (body: string, signature: string) => SDK.webhooks.constructEvent(body, signature, 'whsec_synthetic_settlement_only'),
    stripe: { paymentIntents: { retrieve: provider.intent }, charges: { retrieve: provider.charge }, transfers: { retrieve: provider.transfer },
      applicationFees: { retrieve: provider.fee }, disputes: { list: provider.disputes }, refunds: { list: provider.refunds }, checkout: { sessions: { retrieve: provider.session } } } }
})
const independent = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL })
const users: string[] = [], sports: string[] = [], bookings: string[] = []
let verified = false
let f: any
let parentId: string, trainerId: string, trainerProfileId: string
const evidence = () => ({ bookingId: f.booking.id, paymentId: f.booking.payment.id, attemptId: f.attempt.id,
  sessionId: 'cs_settlement_' + f.booking.id, intentId: f.intent.id, amount: 6000, currency: 'usd', outcome: 'paid' as const })
const payment = () => independent.payment.findUniqueOrThrow({ where: { id: f.booking.payment.id } })
const booking = () => independent.booking.findUniqueOrThrow({ where: { id: f.booking.id } })
const notices = () => independent.notification.findMany({ where: { userId: { in: [parentId, trainerId] } } })
const financialTypes = ['transfer.created', 'transfer.updated', 'transfer.reversed', 'application_fee.created', 'application_fee.refunded',
  'application_fee.refund.updated', 'charge.updated', 'charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.closed',
  'charge.dispute.funds_withdrawn', 'charge.dispute.funds_reinstated']
function financialObject(type: string) {
  if (type.startsWith('transfer.')) return structuredClone(f.transfer)
  if (type === 'application_fee.refund.updated') return { id: 'fr_synthetic', fee: f.fee.id }
  if (type.startsWith('application_fee.')) return structuredClone(f.fee)
  if (type.startsWith('charge.dispute.')) return structuredClone(f.disputes[0] || settlementDispute(f))
  return structuredClone(f.charge)
}
async function webhook(type = 'checkout.session.completed', account?: string, objectOverride?: unknown) {
  const object = objectOverride || (type.startsWith('checkout.') ? await provider.session() : structuredClone(f.intent))
  const body = JSON.stringify({ id: 'evt_synthetic', type, ...(account ? { account } : {}), data: { object } })
  provider.signature = Stripe.webhooks.generateTestHeaderString({ payload: body, secret })
  return POST(new Request('http://localhost/api/payments/webhook', { method: 'POST', body }) as any)
}

beforeAll(async () => {
  expect(await prisma.$queryRaw`SELECT current_database() AS database`).toEqual([{ database: expect.stringMatching(/^trainr_audit_/) }])
  expect(await prisma.$queryRaw`SELECT purpose FROM trainr_test_guard`).toEqual([{ purpose: 'disposable integration database' }])
  verified = true
})
beforeEach(async () => {
  vi.resetAllMocks()
  const id = randomUUID()
  const sport = await prisma.sport.create({ data: { name: id, slug: id } }); sports.push(sport.id)
  const parent = await prisma.user.create({ data: { email: `${id}-parent@example.test`, role: 'PARENT', passwordHash: 'not-a-login',
    parentProfile: { create: { athletes: { create: { firstName: 'Synthetic', lastName: 'Athlete', dateOfBirth: new Date('2015-01-01') } } } } },
    include: { parentProfile: { include: { athletes: true } } } }); users.push(parent.id)
  const trainer = await prisma.user.create({ data: { email: `${id}-trainer@example.test`, role: 'TRAINER', passwordHash: 'not-a-login',
    trainerProfile: { create: { firstName: 'Synthetic', lastName: 'Trainer', slug: id, stripeAccountId: 'acct_settlement', approvalStatus: 'APPROVED',
      serviceOfferings: { create: { title: 'Synthetic session', sportId: sport.id, priceInCents: 6000, durationMinutes: 60 } } } } },
    include: { trainerProfile: { include: { serviceOfferings: true } } } }); users.push(trainer.id)
  const saved = await prisma.booking.create({ data: { parentProfileId: parent.parentProfile!.id, athleteProfileId: parent.parentProfile!.athletes[0].id,
    trainerProfileId: trainer.trainerProfile!.id, serviceOfferingId: trainer.trainerProfile!.serviceOfferings[0].id, date: new Date('2030-11-04'),
    startTime: '09:00', endTime: '10:00', timeZone: 'UTC', startsAt: new Date('2030-11-04T09:00:00Z'), endsAt: new Date('2030-11-04T10:00:00Z'), totalAmountInCents: 6000, platformFeeInCents: 900, trainerPayoutInCents: 5100,
    payment: { create: { amountInCents: 6000, platformFeeInCents: 900, trainerPayoutInCents: 5100 } } }, include: { payment: true } }); bookings.push(saved.id)
  parentId = parent.id; trainerId = trainer.id; trainerProfileId = trainer.trainerProfile!.id
  f = settlementFixture({ bookingId: saved.id, paymentId: saved.payment!.id, attemptId: randomUUID(), intentId: `pi_${id}`, chargeId: `ch_${id}` })
  await prisma.checkoutAttempt.create({ data: { id: f.attempt.id, paymentId: saved.payment!.id, sequence: 1, parameters: f.attempt.parameters,
    stripeCheckoutSessionId: evidence().sessionId } })
  await prisma.payment.update({ where: { id: saved.payment!.id }, data: { stripeCheckoutSessionId: evidence().sessionId } })
  for (const name of ['intent', 'charge', 'transfer', 'fee'] as const) provider[name].mockImplementation(async () => structuredClone(f[name]))
  f.disputes = []
  provider.disputes.mockImplementation(async () => ({ data: structuredClone(f.disputes), has_more: false }))
  provider.refunds.mockResolvedValue({ data: [], has_more: false })
  provider.session.mockImplementation(async () => ({ id: evidence().sessionId, status: 'complete', payment_status: 'paid', mode: 'payment',
    currency: 'usd', amount_total: 6000, payment_intent: f.intent.id, metadata: structuredClone(f.intent.metadata), url: null }))
})
afterAll(async () => {
  if (verified) {
    await prisma.adminAction.deleteMany({ where: { adminUserId: { in: users } } })
    await prisma.booking.deleteMany({ where: { id: { in: bookings } } })
    await prisma.user.deleteMany({ where: { id: { in: users } } })
    await prisma.sport.deleteMany({ where: { id: { in: sports } } })
  }
  await prisma.$disconnect()
  await independent.$disconnect()
})

describe('real settlement verifier, signatures, SQL and refund reconciliation with simulated Stripe receipts', () => {
  const inventoryEvents = ['checkout.session.completed', 'payment_intent.succeeded', 'transfer.created', 'application_fee.created', 'charge.updated']
  for (const entry of ['paid', 'refund'] as const) {
    it.each([{ refundAmountInCents: 1000 }, { refundPendingAmountInCents: 1000 }, { refundFailedCount: 1 },
      { status: 'REFUNDED' as const }, { status: 'PARTIALLY_REFUNDED' as const }])(`cash refund ledger ${entry} rejects unexplained state %j`, async patch => {
      await prisma.payment.update({ where: { id: f.booking.payment.id }, data: { ...patch, stripePaymentIntentId: f.intent.id } })
      const before = await payment()
      if (entry === 'paid') expect((await webhook()).status).toBe(409)
      else await expect(reconcilePaymentRefunds(f.booking.id)).rejects.toMatchObject({ status: 409 })
      expect(await payment()).toEqual(before)
      expect((await booking()).status).toBe('PENDING')
      expect(await notices()).toHaveLength(0)
    })
  }
  for (const type of inventoryEvents) {
    it.each(['pending', 'requires_action', 'failed', 'canceled', 'succeeded'])(`cash current refund inventory ${type} retains %s before confirmation`, async status => {
      const refund = { id: `re_${randomUUID()}`, charge: f.charge.id, payment_intent: f.intent.id,
        status, amount: 1000, currency: 'usd', created: 1791440000 }
      provider.refunds.mockResolvedValue({ data: [refund], has_more: false })
      const response = await webhook(type, undefined, financialTypes.includes(type) ? financialObject(type) : undefined)
      expect(response.status).toBe(200)
      expect(provider.refunds).toHaveBeenCalled()
      expect(await payment()).toMatchObject({
        refundAmountInCents: status === 'succeeded' ? 1000 : 0,
        refundPendingAmountInCents: ['pending', 'requires_action'].includes(status) ? 1000 : 0,
        refundFailedCount: ['failed', 'canceled'].includes(status) ? 1 : 0,
        financialReview: expect.any(Object), refundsVerifiedAt: expect.any(Date),
      })
      expect((await booking()).status).toBe('PENDING')
      expect(await independent.paymentRefund.count({ where: { paymentId: f.booking.payment.id } })).toBe(1)
      expect((await notices()).some(item => ['BOOKING_CONFIRMED', 'PAYMENT_RECEIVED'].includes(item.type))).toBe(false)
      expect((await notices()).filter(item => item.type === 'PAYMENT_REVIEW_REQUIRED')).toHaveLength(2)
    })
    it(`cash current refund inventory ${type} rolls back on provider outage`, async () => {
      provider.refunds.mockRejectedValue(new Error('synthetic refund inventory unavailable'))
      const before = await payment()
      const response = await webhook(type, undefined, financialTypes.includes(type) ? financialObject(type) : undefined)
      expect(response.status).toBe(503)
      expect(await payment()).toEqual(before)
      expect((await booking()).status).toBe('PENDING')
      expect(await notices()).toHaveLength(0)
    })
  }
  for (const review of [Prisma.JsonNull, false, 0, '', { reason: 'synthetic review' }]) {
    it(`allows owner cancellation without clearing cash review presence ${JSON.stringify(review)}`, async () => {
      await webhook()
      await prisma.payment.update({ where: { id: f.booking.payment.id }, data: { financialReview: review } })
      const before = await payment()
      await applyBookingAction(f.booking.id, { id: parentId, role: 'PARENT' }, { action: 'cancel' })
      expect((await booking()).status).toBe('CANCELLED')
      expect(await payment()).toEqual(before)
      expect(await independent.payment.count({ where: { id: f.booking.payment.id, financialReview: { not: Prisma.DbNull } } })).toBe(1)
    })
    it.each(['confirm', 'complete', 'no_show'] as const)(`blocks cash review presence ${JSON.stringify(review)} for %s`, async action => {
      await webhook()
      await prisma.payment.update({ where: { id: f.booking.payment.id }, data: { financialReview: review } })
      await prisma.booking.update({ where: { id: f.booking.id }, data: {
        status: action === 'confirm' ? 'PENDING' : 'CONFIRMED',
      } })
      const before = await booking()
      const beforeTrainer = await independent.trainerProfile.findUniqueOrThrow({ where: { id: trainerProfileId } })
      const beforeNotices = await notices()
      const operator = await admin()
      const clock = vi.spyOn(Date, 'now').mockReturnValue(new Date('2031-01-01').getTime())
      try {
        for (const actor of [{ id: trainerId, role: 'TRAINER' }, { id: operator, role: 'ADMIN' }]) {
          await expect(applyBookingAction(f.booking.id, actor, { action })).rejects.toMatchObject({ status: 409 })
        }
      } finally { clock.mockRestore() }
      expect(await booking()).toEqual(before)
      expect(await independent.trainerProfile.findUniqueOrThrow({ where: { id: trainerProfileId } })).toEqual(beforeTrainer)
      expect(await notices()).toEqual(beforeNotices)
    })
    it(`projects cash review presence ${JSON.stringify(review)} without private detail`, async () => {
      await webhook()
      await prisma.payment.update({ where: { id: f.booking.payment.id }, data: { financialReview: review } })
      for (const actor of [{ id: parentId, role: 'PARENT' }, { id: trainerId, role: 'TRAINER' }]) {
        const result = await readDashboardBookings(actor, actor.role === 'PARENT' ? 'upcoming' : 'all', 1, 10)
        expect(result.bookings[0].payment?.financialReview).toBe(true)
        expect(JSON.stringify(result)).not.toContain('synthetic review')
        expect(JSON.stringify(result)).not.toContain(f.charge.id)
      }
    })
  }
  it.each(['PENDING', 'REVIEW'])('retains captured funds without confirming a reinstated booking while checkout retirement is %s', async status => {
    await prisma.accountCheckoutClosure.create({ data: { userId: trainerId, kind: 'BOOKING', targetId: f.booking.payment.id, status } })
    expect((await webhook()).status).toBe(200)
    expect(await payment()).toMatchObject({ status: 'SUCCEEDED', stripeTransferId: f.transfer.id,
      financialReview: { details: { participantReview: ['checkout_retirement_pending'] } } })
    expect((await booking()).status).toBe('PENDING')
    const reviewNotices = (await notices()).filter(item => item.type === 'PAYMENT_REVIEW_REQUIRED')
    expect(reviewNotices).toHaveLength(2)
    expect(reviewNotices.every(item => item.message.includes('awaiting retirement'))).toBe(true)
    await expect(applyBookingAction(f.booking.id, { id: trainerId, role: 'TRAINER' }, { action: 'confirm' })).rejects.toThrow()
  })
  async function admin() {
    const actor = await prisma.user.create({ data: { email: `reconcile-${randomUUID()}@example.test`, role: 'ADMIN', passwordHash: 'not-a-login' } })
    users.push(actor.id)
    return actor.id
  }
  for (const status of ['PENDING', 'REVIEW']) {
    it.each(['confirm', 'complete', 'no_show'] as const)(`refund refresh retains checkout retirement ${status} before %s`, async action => {
      const operator = await admin()
      await prisma.accountCheckoutClosure.create({ data: { userId: trainerId, kind: 'BOOKING', targetId: f.booking.payment.id, status } })
      expect((await webhook()).status).toBe(200)
      const held = (await payment()).financialReview
      if (action !== 'confirm') await prisma.booking.update({ where: { id: f.booking.id }, data: { status: 'CONFIRMED' } })
      await reconcilePaymentRefunds(f.booking.id, { adminUserId: operator })
      const before = await booking()
      const clock = vi.spyOn(Date, 'now').mockReturnValue(new Date('2031-01-01').getTime())
      try {
        for (const actor of [{ id: trainerId, role: 'TRAINER' }, { id: operator, role: 'ADMIN' }]) {
          await expect(applyBookingAction(f.booking.id, actor, { action })).rejects.toMatchObject({ status: 409 })
        }
      } finally { clock.mockRestore() }
      expect(await booking()).toEqual(before)
      expect((await payment()).financialReview).toEqual(held)
      for (const actor of [{ id: parentId, role: 'PARENT' }, { id: trainerId, role: 'TRAINER' }]) {
        const current = await readDashboardBookings(actor, actor.role === 'PARENT' ? 'upcoming' : 'all', 1, 10)
        expect(current.bookings[0].payment?.financialReview).toBe(true)
      }
    })
  }
  it.each(['pending', 'requires_action', 'failed', 'canceled', 'succeeded'])('refund review identity remains stable across paid and refresh replay: %s', async status => {
    const operator = await admin()
    provider.refunds.mockResolvedValue({ data: [{ id: `re_${randomUUID()}`, charge: f.charge.id, payment_intent: f.intent.id,
      status, amount: 1000, currency: 'usd', created: 1791440000 }], has_more: false })
    expect((await webhook()).status).toBe(200)
    const held = (await payment()).financialReview
    const firstNotices = await notices()
    await reconcilePaymentRefunds(f.booking.id, { adminUserId: operator })
    expect((await payment()).financialReview).toEqual(held)
    expect((await webhook()).status).toBe(200)
    await reconcilePaymentRefunds(f.booking.id, { adminUserId: operator })
    expect((await payment()).financialReview).toEqual(held)
    expect(await notices()).toEqual(firstNotices)
    expect((await booking()).status).toBe('PENDING')
    expect(await independent.adminAction.count({ where: { adminUserId: operator, actionType: 'RECONCILE_REFUNDS' } })).toBe(0)
  })
  it.each(['parent-deleted', 'trainer-deleted', 'both-deleted', 'parent-role', 'trainer-role'])('refund participant review preserves revoked authority: %s', async mode => {
    const operator = await admin()
    const revoked = mode.startsWith('parent') ? [parentId] : mode.startsWith('trainer') ? [trainerId] : [parentId, trainerId]
    await prisma.user.updateMany({ where: { id: { in: revoked } }, data: mode.endsWith('role')
      ? { role: mode.startsWith('parent') ? 'TRAINER' : 'PARENT' } : { deletedAt: new Date() } })
    await prisma.payment.update({ where: { id: f.booking.payment.id }, data: { stripePaymentIntentId: f.intent.id } })
    provider.refunds.mockResolvedValue({ data: [{ id: `re_${randomUUID()}`, charge: f.charge.id, payment_intent: f.intent.id,
      status: 'pending', amount: 1000, currency: 'usd', created: 1791440000 }], has_more: false })
    await reconcilePaymentRefunds(f.booking.id, { adminUserId: operator })
    const held = (await payment()).financialReview
    expect(held).toMatchObject({ details: { participantReview: revoked.map(id => id === parentId ? 'parent_account_unavailable' : 'trainer_account_unavailable') } })
    expect(await independent.notification.count({ where: { userId: { in: revoked } } })).toBe(0)
    expect(await independent.notification.count({ where: { userId: operator, type: 'PAYMENT_REVIEW_REQUIRED' } })).toBe(1)
    await reconcilePaymentRefunds(f.booking.id, { adminUserId: operator })
    expect((await payment()).financialReview).toEqual(held)
    expect(await independent.notification.count({ where: { userId: { in: revoked } } })).toBe(0)
    expect(await independent.adminAction.count({ where: { adminUserId: operator, actionType: 'RECONCILE_REFUNDS' } })).toBe(1)
  })
  it.each(['parent', 'trainer', 'admin'])('refund participant locks recheck %s revocation committed while waiting', async participant => {
    const operator = await admin()
    const userId = participant === 'parent' ? parentId : participant === 'trainer' ? trainerId : operator
    await prisma.payment.update({ where: { id: f.booking.payment.id }, data: { stripePaymentIntentId: f.intent.id } })
    let release!: () => void, ready!: (pid: number) => void
    const locked = new Promise<number>(resolve => { ready = resolve })
    const writer = independent.$transaction(async tx => {
      const [backend] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`
      await tx.user.update({ where: { id: userId }, data: { deletedAt: new Date() } })
      const untilReleased = new Promise<void>(resolve => { release = resolve })
      ready(backend.pid)
      await untilReleased
    }, { timeout: 15000 })
    const holder = await locked
    const delivery = reconcilePaymentRefunds(f.booking.id, { adminUserId: operator }).then(() => null, error => error as Error & { status?: number })
    try {
      await expect.poll(async () => {
        const [waiting] = await independent.$queryRaw<Array<{ count: number }>>`SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE ${holder} = ANY(pg_blocking_pids(pid)) AND wait_event_type = 'Lock'`
        return waiting.count
      }, { timeout: 3000 }).toBeGreaterThan(0)
      expect(provider.charge).not.toHaveBeenCalled()
    } finally { release(); await writer }
    const result = await delivery
    expect((await booking()).status).toBe('PENDING')
    if (participant === 'admin') {
      expect(result?.status).toBe(403)
      expect(await payment()).toMatchObject({ status: 'PENDING', stripeChargeId: null, stripeTransferId: null })
    } else {
      expect(result).toBeNull()
      expect((await payment()).financialReview).toMatchObject({ details: { participantReview: [`${participant}_account_unavailable`] } })
    }
    expect(await independent.notification.count({ where: { userId } })).toBe(0)
  })
  it.each(['parent', 'trainer', 'admin'])('refund participant locks hold %s authority through provider verification', async participant => {
    const operator = await admin()
    const userId = participant === 'parent' ? parentId : participant === 'trainer' ? trainerId : operator
    await prisma.payment.update({ where: { id: f.booking.payment.id }, data: { stripePaymentIntentId: f.intent.id } })
    let release!: () => void, ready!: () => void
    const verifying = new Promise<void>(resolve => { ready = resolve })
    provider.fee.mockImplementationOnce(async () => {
      const untilReleased = new Promise<void>(resolve => { release = resolve })
      ready()
      await untilReleased
      return structuredClone(f.fee)
    })
    const delivery = reconcilePaymentRefunds(f.booking.id, { adminUserId: operator })
    await verifying
    let writerReady!: (pid: number) => void
    const started = new Promise<number>(resolve => { writerReady = resolve })
    const writer = independent.$transaction(async tx => {
      const [backend] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`
      writerReady(backend.pid)
      await tx.user.update({ where: { id: userId }, data: { deletedAt: new Date() } })
    }, { timeout: 15000 })
    const writerPid = await started
    try {
      await expect.poll(async () => {
        const [waiting] = await independent.$queryRaw<Array<{ count: number }>>`SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE pid = ${writerPid} AND wait_event_type = 'Lock'`
        return waiting.count
      }, { timeout: 3000 }).toBe(1)
    } finally { release(); await delivery; await writer }
    expect((await booking()).status).toBe('PENDING')
    expect((await payment()).status).toBe('SUCCEEDED')
    expect(await independent.adminAction.count({ where: { adminUserId: operator, actionType: 'RECONCILE_REFUNDS' } })).toBe(1)
  })
  it.each(['PENDING', 'FAILED'] as const)('refund refresh cannot promote %s without the agreed destination receipt', async status => {
    await prisma.payment.update({ where: { id: f.booking.payment.id }, data: { status, stripePaymentIntentId: f.intent.id } })
    f.transfer.destination = 'acct_wrong'
    await expect(reconcilePaymentRefunds(f.booking.id)).rejects.toThrow('transfer does not match')
    expect(await payment()).toMatchObject({ status, stripeChargeId: null, stripeTransferId: null, refundsVerifiedAt: null })
    expect((await booking()).status).toBe('PENDING')
    expect(await independent.paymentRefund.count({ where: { paymentId: f.booking.payment.id } })).toBe(0)
    expect(await notices()).toHaveLength(0)
  })
  it('refund refresh rejects missing immutable checkout history before changing financial records', async () => {
    await prisma.payment.update({ where: { id: f.booking.payment.id }, data: { stripePaymentIntentId: f.intent.id } })
    await prisma.checkoutAttempt.delete({ where: { id: f.attempt.id } })
    await expect(reconcilePaymentRefunds(f.booking.id)).rejects.toThrow('Immutable checkout destination')
    expect((await payment()).status).toBe('PENDING')
    expect(provider.refunds).not.toHaveBeenCalled()
    expect(await notices()).toHaveLength(0)
  })
  it('refund refresh keeps a provider-read failure retryable without marking the payment successful', async () => {
    await prisma.payment.update({ where: { id: f.booking.payment.id }, data: { stripePaymentIntentId: f.intent.id } })
    provider.transfer.mockRejectedValueOnce(new Error('synthetic transfer read unavailable'))
    await expect(reconcilePaymentRefunds(f.booking.id)).rejects.toThrow('transfer read unavailable')
    expect(await payment()).toMatchObject({ status: 'PENDING', stripeChargeId: null, stripeTransferId: null, refundsVerifiedAt: null })
    await reconcilePaymentRefunds(f.booking.id)
    expect(await payment()).toMatchObject({ status: 'SUCCEEDED', stripeChargeId: f.charge.id, stripeTransferId: f.transfer.id })
    expect((await booking()).status).toBe('PENDING')
  })
  it('refund refresh waits for refund history when the charge already reports returned money', async () => {
    await prisma.payment.update({ where: { id: f.booking.payment.id }, data: { stripePaymentIntentId: f.intent.id } })
    f.charge.refunded = true
    f.charge.amount_refunded = 6000
    await expect(reconcilePaymentRefunds(f.booking.id)).rejects.toThrow('Refund history is not available')
    expect(await payment()).toMatchObject({ status: 'PENDING', stripeChargeId: null, stripeTransferId: null, refundsVerifiedAt: null })
    expect((await booking()).status).toBe('PENDING')
    expect(await notices()).toHaveLength(0)
    provider.refunds.mockResolvedValue({ data: [{ id: `re_${randomUUID()}`, charge: f.charge.id, payment_intent: f.intent.id,
      status: 'succeeded', amount: 6000, currency: 'usd', created: 1791440000 }], has_more: false })
    await reconcilePaymentRefunds(f.booking.id)
    expect(await payment()).toMatchObject({ status: 'REFUNDED', stripeTransferId: f.transfer.id, refundAmountInCents: 6000 })
    expect((await booking()).status).toBe('CANCELLED')
  })
  it('refund refresh audits a newly verified transfer once without inventing a customer refund', async () => {
    const actor = await admin()
    await prisma.payment.update({ where: { id: f.booking.payment.id }, data: {
      status: 'SUCCEEDED', stripePaymentIntentId: f.intent.id, stripeChargeId: f.charge.id,
    } })
    await reconcilePaymentRefunds(f.booking.id, { adminUserId: actor })
    await reconcilePaymentRefunds(f.booking.id, { adminUserId: actor })
    expect(await payment()).toMatchObject({ status: 'SUCCEEDED', stripeTransferId: f.transfer.id, refundAmountInCents: 0 })
    expect(await independent.adminAction.count({ where: { adminUserId: actor, actionType: 'RECONCILE_REFUNDS' } })).toBe(1)
    expect((await independent.adminAction.findFirstOrThrow({ where: { adminUserId: actor, actionType: 'RECONCILE_REFUNDS' } })).metadata)
      .toMatchObject({ chargeId: f.charge.id, transferId: f.transfer.id })
    expect(await notices()).toHaveLength(0)
  })
  it.each([false, true])('early signed refund verifies the destination before recording money returned (wrong destination: %s)', async wrongDestination => {
    await prisma.payment.update({ where: { id: f.booking.payment.id }, data: { stripePaymentIntentId: f.intent.id } })
    f.charge.refunded = true
    f.charge.amount_refunded = 6000
    if (wrongDestination) f.transfer.destination = 'acct_wrong'
    const refund = { id: `re_${randomUUID()}`, charge: f.charge.id, payment_intent: f.intent.id,
      status: 'succeeded', amount: 6000, currency: 'usd', created: 1791440000 }
    provider.refunds.mockResolvedValue({ data: [refund], has_more: false })
    const response = await webhook('refund.updated', undefined, refund)
    expect(response.status).toBe(wrongDestination ? 409 : 200)
    expect(await payment()).toMatchObject(wrongDestination
      ? { status: 'PENDING', stripeChargeId: null, stripeTransferId: null, refundAmountInCents: 0, refundsVerifiedAt: null }
      : { status: 'REFUNDED', stripeChargeId: f.charge.id, stripeTransferId: f.transfer.id, refundAmountInCents: 6000 })
    expect((await booking()).status).toBe(wrongDestination ? 'PENDING' : 'CANCELLED')
    expect(await independent.paymentRefund.count({ where: { paymentId: f.booking.payment.id } })).toBe(wrongDestination ? 0 : 1)
    if (wrongDestination) expect(await notices()).toHaveLength(0)
    else {
      await webhook('refund.updated', undefined, refund)
      expect(await notices()).toHaveLength(2)
    }
  })
  it('recovers a missed paid event after the parent checkout window closed and concurrent webhook retries', async () => {
    const actor = await admin()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(new Date('2030-11-05T00:00:00Z').getTime())
    try {
      await expect(startOrResumeCheckout(f.booking.id, { id: parentId }, 'acct_settlement')).rejects.toThrow('started')
      expect(provider.session).not.toHaveBeenCalled()
      await Promise.all([reconcileBookingPayment(f.booking.id, actor), webhook(), reconcileBookingPayment(f.booking.id, actor)])
      expect(await payment()).toMatchObject({ status: 'SUCCEEDED', stripePaymentIntentId: f.intent.id, stripeChargeId: f.charge.id, stripeTransferId: f.transfer.id })
      expect((await booking()).status).toBe('CONFIRMED')
      expect(await notices()).toHaveLength(2)
      expect(await independent.adminAction.count({ where: { adminUserId: actor, actionType: 'RECONCILE_PAYMENT' } })).toBe(2)
    } finally { clock.mockRestore() }
  })
  it('can verify a saved intent without a Checkout ID, without making a new session', async () => {
    const actor = await admin()
    await prisma.checkoutAttempt.update({ where: { id: f.attempt.id }, data: { stripeCheckoutSessionId: null } })
    await prisma.payment.update({ where: { id: f.booking.payment.id }, data: { stripeCheckoutSessionId: null, stripePaymentIntentId: f.intent.id } })
    await reconcileBookingPayment(f.booking.id, actor)
    expect(provider.session).not.toHaveBeenCalled()
    expect((await payment()).status).toBe('SUCCEEDED')
  })
  it.each(['PARENT', 'TRAINER', 'deleted', 'missing'])('rejects unauthorized refresh %s before provider reads', async role => {
    const actor = await admin()
    if (role === 'deleted') await prisma.user.update({ where: { id: actor }, data: { deletedAt: new Date() } })
    else if (role !== 'missing') await prisma.user.update({ where: { id: actor }, data: { role: role as 'PARENT' | 'TRAINER' } })
    await expect(reconcileBookingPayment(f.booking.id, role === 'missing' ? 'missing' : actor)).rejects.toThrow('Administrator')
    expect(provider.session).not.toHaveBeenCalled()
    expect((await payment()).status).toBe('PENDING')
  })
  it.each(['role', 'deletion'])('rechecks admin %s after the external lookup', async change => {
    const actor = await admin(), original = await provider.session()
    provider.session.mockImplementationOnce(async () => {
      await independent.user.update({ where: { id: actor }, data: change === 'role' ? { role: 'PARENT' } : { deletedAt: new Date() } })
      return original
    })
    await expect(reconcileBookingPayment(f.booking.id, actor)).rejects.toThrow('Administrator')
    expect((await payment()).status).toBe('PENDING')
    expect(await notices()).toHaveLength(0)
    expect(await independent.adminAction.count({ where: { adminUserId: actor } })).toBe(0)
  })
  it.each(['open', 'expired', 'unpaid', 'wrong-id', 'wrong-amount', 'wrong-attempt', 'no-intent'])('does not settle an unverifiable session: %s', async kind => {
    const actor = await admin(), original = await provider.session()
    if (kind === 'open' || kind === 'expired') original.status = kind
    if (kind === 'unpaid') original.payment_status = 'unpaid'
    if (kind === 'wrong-id') original.id = 'cs_other'
    if (kind === 'wrong-amount') original.amount_total++
    if (kind === 'wrong-attempt') original.metadata.checkoutAttemptId = 'other'
    if (kind === 'no-intent') original.payment_intent = null
    provider.session.mockResolvedValue(original)
    await expect(reconcileBookingPayment(f.booking.id, actor)).rejects.toThrow()
    expect((await payment()).status).toBe('PENDING')
    expect(await notices()).toHaveLength(0)
  })
  it.each(['missing-identity', 'retired', 'disagreement', 'missing-attempt', 'zero', 'missing-booking'])('refuses unsafe saved evidence: %s', async kind => {
    const actor = await admin()
    if (kind === 'missing-identity') {
      await prisma.checkoutAttempt.update({ where: { id: f.attempt.id }, data: { stripeCheckoutSessionId: null } })
      await prisma.payment.update({ where: { id: f.booking.payment.id }, data: { stripeCheckoutSessionId: null } })
    }
    if (kind === 'retired') await prisma.checkoutAttempt.update({ where: { id: f.attempt.id }, data: { retiredAt: new Date() } })
    if (kind === 'disagreement') await prisma.payment.update({ where: { id: f.booking.payment.id }, data: { stripeCheckoutSessionId: 'cs_other' } })
    if (kind === 'missing-attempt') await prisma.checkoutAttempt.delete({ where: { id: f.attempt.id } })
    if (kind === 'zero') await prisma.payment.update({ where: { id: f.booking.payment.id }, data: { amountInCents: 0 } })
    await expect(reconcileBookingPayment(kind === 'missing-booking' ? 'missing' : f.booking.id, actor)).rejects.toThrow()
    expect(provider.session).not.toHaveBeenCalled()
    expect(provider.intent).not.toHaveBeenCalled()
    expect(await notices()).toHaveLength(0)
  })
  it('rejects an attempt that retired while the session was retrieved', async () => {
    const actor = await admin(), original = await provider.session()
    provider.session.mockImplementationOnce(async () => {
      await independent.checkoutAttempt.update({ where: { id: f.attempt.id }, data: { retiredAt: new Date() } })
      return original
    })
    await expect(reconcileBookingPayment(f.booking.id, actor)).rejects.toThrow('different checkout attempt')
    expect((await payment()).status).toBe('PENDING')
  })
  it('does not treat a paid session as a verified trainer transfer', async () => {
    const actor = await admin()
    f.transfer.destination = 'acct_wrong'
    await expect(reconcileBookingPayment(f.booking.id, actor)).rejects.toThrow('transfer does not match')
    expect((await payment()).status).toBe('PENDING')
    expect(await notices()).toHaveLength(0)
  })
  it('recovers provider failure on retry and keeps a cancelled paid booking cancelled with review notices', async () => {
    const actor = await admin()
    await prisma.booking.update({ where: { id: f.booking.id }, data: { status: 'CANCELLED' } })
    provider.transfer.mockRejectedValueOnce(new Error('temporary provider failure'))
    await expect(reconcileBookingPayment(f.booking.id, actor)).rejects.toThrow('temporary')
    expect((await payment()).status).toBe('PENDING')
    await reconcileBookingPayment(f.booking.id, actor)
    expect((await payment()).status).toBe('SUCCEEDED')
    expect((await booking()).status).toBe('CANCELLED')
    expect((await notices()).every(item => item.type === 'PAYMENT_REVIEW_REQUIRED')).toBe(true)
    expect(await independent.notification.count({ where: { userId: actor, type: 'PAYMENT_REVIEW_REQUIRED' } })).toBe(1)
  })
  it('refreshes full refund and reversal evidence without restoring settlement or booking', async () => {
    const actor = await admin()
    await webhook()
    f.charge.refunded = true; f.charge.amount_refunded = 6000; f.transfer.amount_reversed = 6000
    provider.refunds.mockResolvedValue({ data: [{ id: 're_' + randomUUID(), charge: f.charge.id, payment_intent: f.intent.id, amount: 6000, currency: 'usd', status: 'succeeded', created: 1791440000 }], has_more: false })
    await reconcilePaymentRefunds(f.booking.id)
    await reconcileBookingPayment(f.booking.id, actor)
    expect((await payment()).status).toBe('REFUNDED')
    expect((await booking()).status).toBe('CANCELLED')
    expect((await notices()).filter(item => item.type === 'PAYMENT_REVIEW_REQUIRED')).toHaveLength(2)
  })
  it('delivers a signed financial change to each authorized inbox without read actions changing money or bookings', async () => {
    const admin = await prisma.user.create({ data: { email: `inbox-admin-${randomUUID()}@example.test`, passwordHash: 'not-a-login', role: 'ADMIN' } })
    users.push(admin.id)
    await webhook()
    f.transfer.amount_reversed = 600
    f.disputes = [settlementDispute(f)]
    expect((await webhook('charge.dispute.created', undefined, financialObject('charge.dispute.created'))).status).toBe(200)
    for (const actor of [{ id: parentId, role: 'PARENT' }, { id: trainerId, role: 'TRAINER' }, admin]) {
      const inbox = await readNotifications(actor, { page: 1, limit: 50, view: 'all' })
      const review = inbox.notifications.find(item => item.type === 'PAYMENT_REVIEW_REQUIRED')!
      expect(review.financialReview).toMatchObject({ transferReversedInCents: 600, disputes: [{ id: 'du_synthetic', status: 'needs_response' }] })
      await changeNotifications(actor, { ids: [review.id], read: true })
      expect((await readNotifications(actor, { page: 1, limit: 50, view: 'unread' })).notifications.some(item => item.id === review.id)).toBe(false)
    }
    expect((await booking()).status).toBe('CONFIRMED')
    expect((await payment()).status).toBe('SUCCEEDED')
    expect((await notices()).filter(item => item.type === 'PAYMENT_REVIEW_REQUIRED')).toHaveLength(2)
  })
  it.each(financialTypes)('handles signed %s with current receipt verification and replay-safe notifications', async type => {
    expect((await webhook()).status).toBe(200)
    f.transfer.amount_reversed = 600
    f.fee.amount_refunded = 100
    if (type.startsWith('charge.dispute.')) f.disputes = [settlementDispute(f)]
    const object = financialObject(type)
    expect((await webhook(type, undefined, object)).status).toBe(200)
    expect((await webhook(type, undefined, object)).status).toBe(200)
    expect((await notices()).filter(item => item.type === 'PAYMENT_REVIEW_REQUIRED')).toHaveLength(2)
    expect((await booking()).status).toBe('CONFIRMED')
    expect((await payment()).status).toBe('SUCCEEDED')
  })
  it.each(financialTypes)('ignores connected-account %s without provider lookup or financial mutation', async type => {
    expect((await webhook(type, 'acct_connected', financialObject(type))).status).toBe(200)
    expect(provider.charge).not.toHaveBeenCalled()
    expect(provider.transfer).not.toHaveBeenCalled()
    expect(provider.fee).not.toHaveBeenCalled()
    expect((await payment()).status).toBe('PENDING')
    expect(await notices()).toHaveLength(0)
  })
  it('uses current provider amounts for a delayed reversal and notifies again for a later different reversal', async () => {
    await webhook()
    const stale = financialObject('transfer.reversed')
    f.transfer.amount_reversed = 600
    expect((await webhook('transfer.reversed', undefined, stale)).status).toBe(200)
    let reviews = (await notices()).filter(item => item.type === 'PAYMENT_REVIEW_REQUIRED')
    expect(reviews).toHaveLength(2)
    expect(reviews[0].data).toMatchObject({ financialReview: { transferReversedInCents: 600 } })
    f.transfer.amount_reversed = 1200
    await webhook('transfer.reversed', undefined, stale)
    await webhook('transfer.reversed', undefined, stale)
    reviews = (await notices()).filter(item => item.type === 'PAYMENT_REVIEW_REQUIRED')
    expect(reviews).toHaveLength(4)
    expect(new Set(reviews.map(item => (item.data as any).financialReviewKey)).size).toBe(2)
  })
  it('tracks current dispute status and funds observations without reopening an inquiry-held booking', async () => {
    f.disputes = [settlementDispute(f, { status: 'warning_needs_response' })]
    const original = financialObject('charge.dispute.created')
    expect((await webhook('charge.dispute.created', undefined, original)).status).toBe(200)
    expect((await booking()).status).toBe('PENDING')
    expect((await webhook()).status).toBe(200)
    expect((await booking()).status).toBe('PENDING')
    f.disputes[0].status = 'won'
    await webhook('charge.dispute.closed', undefined, original)
    f.disputes[0].balance_transactions = [{ id: 'txn_restored', amount: 6000, fee: 0, net: 6000, currency: 'usd' }]
    await webhook('charge.dispute.funds_reinstated', undefined, original)
    await webhook('charge.dispute.created', undefined, original)
    const reviews = (await notices()).filter(item => item.type === 'PAYMENT_REVIEW_REQUIRED')
    expect(reviews).toHaveLength(6)
    expect(reviews.some(item => JSON.stringify(item.data).includes('txn_restored'))).toBe(true)
    expect((await booking()).status).toBe('PENDING')
    expect((await payment()).status).toBe('SUCCEEDED')
  })
  it('continues transfer review after a full customer refund without undoing the refund or cancellation', async () => {
    await webhook()
    f.charge.refunded = true; f.charge.amount_refunded = 6000; f.transfer.amount_reversed = 6000
    provider.refunds.mockResolvedValue({ data: [{ id: 're_' + randomUUID(), charge: f.charge.id, payment_intent: f.intent.id,
      amount: 6000, currency: 'usd', status: 'succeeded', created: 1791440000 }], has_more: false })
    await reconcilePaymentRefunds(f.booking.id)
    expect((await webhook('transfer.reversed', undefined, f.transfer)).status).toBe(200)
    expect((await payment()).status).toBe('REFUNDED')
    expect((await booking()).status).toBe('CANCELLED')
    expect((await notices()).filter(item => item.type === 'PAYMENT_REVIEW_REQUIRED')).toHaveLength(2)
  })
  it('rejects a triggering transfer not in the charge chain despite copied booking metadata', async () => {
    const extra = { ...f.transfer, id: 'tr_unrelated', metadata: f.intent.metadata }
    provider.transfer.mockImplementation(async id => structuredClone(id === extra.id ? extra : f.transfer))
    expect((await webhook('transfer.reversed', undefined, extra)).status).toBe(409)
    expect((await payment()).status).toBe('PENDING')
    expect(await notices()).toHaveLength(0)
  })
  it('refuses an ambiguous transfer mapped to two payment records', async () => {
    await webhook()
    const saved = await booking()
    const { id: _id, createdAt: _created, updatedAt: _updated, ...copy } = saved
    const other = await prisma.booking.create({ data: { ...copy, status: 'CANCELLED', payment: { create: {
      amountInCents: 6000, platformFeeInCents: 900, trainerPayoutInCents: 5100, stripeTransferId: f.transfer.id,
    } } } }); bookings.push(other.id)
    const response = await webhook('transfer.reversed', undefined, f.transfer)
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: 'Financial event does not map to one booking payment' })
    expect((await notices()).filter(item => item.type === 'PAYMENT_REVIEW_REQUIRED')).toHaveLength(0)
  })
  it('rolls back all financial writes when a current dispute read fails, then retries the same event', async () => {
    f.disputes = [settlementDispute(f)]
    provider.disputes.mockRejectedValueOnce(new Error('private provider diagnostics'))
    const object = financialObject('charge.dispute.created')
    const response = await webhook('charge.dispute.created', undefined, object)
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('private provider')
    expect(await payment()).toMatchObject({ status: 'PENDING', stripeChargeId: null, stripeTransferId: null })
    expect(await notices()).toHaveLength(0)
    expect((await webhook('charge.dispute.created', undefined, object)).status).toBe(200)
    expect((await booking()).status).toBe('PENDING')
  })
  it.each(['reversal', 'late'])('notifies only active admins and rolls back a %s observation when an admin notice fails', async mode => {
    const active = await prisma.user.create({ data: { email: `active-${randomUUID()}@example.test`, role: 'ADMIN', passwordHash: 'not-a-login' } }); users.push(active.id)
    const deleted = await prisma.user.create({ data: { email: `deleted-${randomUUID()}@example.test`, role: 'ADMIN', passwordHash: 'not-a-login', deletedAt: new Date() } }); users.push(deleted.id)
    expect(verified).toBe(true)
    expect(active.id).toMatch(/^[a-z0-9]+$/)
    await independent.$executeRawUnsafe(`ALTER TABLE notifications ADD CONSTRAINT financial_admin_notification_failure CHECK ("userId" <> '${active.id}') NOT VALID`)
    if (mode === 'reversal') f.transfer.amount_reversed = 1000
    else await prisma.booking.update({ where: { id: f.booking.id }, data: { status: 'CANCELLED' } })
    try {
      expect((await webhook('transfer.reversed', undefined, f.transfer)).status).toBe(503)
      expect((await payment()).status).toBe('PENDING')
      expect(await notices()).toHaveLength(0)
    } finally {
      await independent.$executeRawUnsafe('ALTER TABLE notifications DROP CONSTRAINT financial_admin_notification_failure')
    }
    await webhook('transfer.reversed', undefined, f.transfer)
    await webhook('transfer.reversed', undefined, f.transfer)
    expect(await independent.notification.count({ where: { userId: active.id, type: 'PAYMENT_REVIEW_REQUIRED' } })).toBe(1)
    expect(await independent.notification.count({ where: { userId: deleted.id } })).toBe(0)
    expect((await booking()).status).toBe(mode === 'late' ? 'CANCELLED' : 'PENDING')
  })
  it.each([
    ['role', 'reversal'], ['deactivation', 'reversal'], ['role', 'late'], ['deactivation', 'late'],
  ])('does not disclose a review after admin %s commits while %s delivery waits', async (change, mode) => {
    const admin = await prisma.user.create({ data: { email: `race-${randomUUID()}@example.test`, role: 'ADMIN', passwordHash: 'not-a-login' } }); users.push(admin.id)
    let release!: () => void
    let ready!: (pid: number) => void
    const locked = new Promise<number>(resolve => { ready = resolve })
    const hold = independent.$transaction(async tx => {
      const [backend] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${admin.id} FOR UPDATE`
      await tx.user.update({ where: { id: admin.id }, data: change === 'role' ? { role: 'PARENT' } : { deletedAt: new Date() } })
      const untilReleased = new Promise<void>(resolve => { release = resolve })
      ready(backend.pid)
      await untilReleased
    }, { timeout: 15000 })
    const holder = await locked
    if (mode === 'reversal') f.transfer.amount_reversed = 1000
    else await prisma.booking.update({ where: { id: f.booking.id }, data: { status: 'CANCELLED' } })
    const delivery = webhook('transfer.reversed', undefined, f.transfer)
    let response: Awaited<typeof delivery>
    try {
      await expect.poll(async () => {
        const [waiting] = await independent.$queryRaw<Array<{ count: number }>>`SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE ${holder} = ANY(pg_blocking_pids(pid)) AND wait_event_type = 'Lock'`
        return waiting.count
      }, { timeout: 3000 }).toBeGreaterThan(0)
    } finally { release(); await hold; response = await delivery }
    expect(response.status).toBe(200)
    expect(await independent.notification.count({ where: { userId: admin.id } })).toBe(0)
    expect((await notices()).filter(item => item.type === 'PAYMENT_REVIEW_REQUIRED')).toHaveLength(2)
  })
  it.each(['transfer.reversed', 'application_fee.refunded', 'charge.dispute.created'])('processes a later %s without replaying a payment event', async type => {
    expect((await webhook()).status).toBe(200)
    let object: any
    if (type === 'transfer.reversed') { f.transfer.amount_reversed = 600; object = f.transfer }
    else if (type === 'application_fee.refunded') { f.fee.amount_refunded = 100; object = f.fee }
    else {
      f.charge.disputed = true
      object = settlementDispute(f)
      f.disputes = [object]
    }
    expect((await webhook(type, undefined, object)).status).toBe(200)
    expect((await notices()).filter(item => item.type === 'PAYMENT_REVIEW_REQUIRED')).toHaveLength(2)
    expect((await booking()).status).toBe('CONFIRMED')
  })
  it.each(['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'payment_intent.succeeded'])('settles signed %s, persists transfer, and confirms exactly once on replay', async type => {
    expect((await webhook(type)).status).toBe(200)
    expect((await webhook(type)).status).toBe(200)
    expect(await payment()).toMatchObject({ status: 'SUCCEEDED', stripePaymentIntentId: f.intent.id, stripeChargeId: f.charge.id, stripeTransferId: f.transfer.id })
    expect((await booking()).status).toBe('CONFIRMED')
    expect(await notices()).toHaveLength(2)
    expect(provider.intent).toHaveBeenCalledTimes(2)
    expect(provider.fee).toHaveBeenCalledTimes(2)
  })
  it('serializes simultaneous paid deliveries and persists only one confirmation', async () => {
    await Promise.all([applyPaymentEvidence(evidence()), applyPaymentEvidence(evidence())])
    expect((await booking()).status).toBe('CONFIRMED')
    expect(await notices()).toHaveLength(2)
  })
  it('rolls back verified identities, confirmation and attempt recovery when notification SQL fails, then retries', async () => {
    expect(verified).toBe(true)
    expect(f.booking.id).toMatch(/^[a-z0-9]+$/)
    await prisma.checkoutAttempt.update({ where: { id: f.attempt.id }, data: { stripeCheckoutSessionId: null } })
    await prisma.payment.update({ where: { id: f.booking.payment.id }, data: { stripeCheckoutSessionId: null } })
    await independent.$executeRawUnsafe(`ALTER TABLE notifications ADD CONSTRAINT settlement_notification_failure CHECK ((data->>'bookingId') <> '${f.booking.id}') NOT VALID`)
    try {
      expect((await webhook()).status).toBe(503)
      expect(provider.fee).toHaveBeenCalledOnce()
      expect(await payment()).toMatchObject({ status: 'PENDING', stripePaymentIntentId: null, stripeChargeId: null, stripeTransferId: null, stripeCheckoutSessionId: null })
      expect((await booking()).status).toBe('PENDING')
      expect((await independent.checkoutAttempt.findUniqueOrThrow({ where: { id: f.attempt.id } })).stripeCheckoutSessionId).toBeNull()
      expect(await notices()).toHaveLength(0)
    } finally {
      await independent.$executeRawUnsafe('ALTER TABLE notifications DROP CONSTRAINT settlement_notification_failure')
    }
    expect((await webhook()).status).toBe(200)
    expect((await payment()).stripeTransferId).toBe(f.transfer.id)
    expect((await booking()).status).toBe('CONFIRMED')
  })
  it.each([
    ['intent', { transfer_data: { destination: 'acct_other' } }], ['intent', { application_fee_amount: 901 }],
    ['charge', { captured: false }], ['charge', { amount_captured: 5999 }], ['charge', { payment_intent: 'pi_other' }],
    ['transfer', { destination: 'acct_other' }], ['transfer', { amount: 5100 }], ['transfer', { source_transaction: 'ch_other' }],
    ['fee', { amount: 901 }], ['fee', { originating_transaction: 'ch_other' }], ['fee', { charge: 'ch_wrong_side' }],
  ])('rejects %s mismatch %j atomically through the signed webhook', async (name, patch) => {
    Object.assign(f[name as string], patch)
    expect((await webhook()).status).toBe(409)
    expect(await payment()).toMatchObject({ status: 'PENDING', stripePaymentIntentId: null, stripeChargeId: null, stripeTransferId: null })
    expect((await booking()).status).toBe('PENDING')
    expect(await notices()).toHaveLength(0)
  })
  it.each(['transfer', 'fee', 'network'])('returns retryable failure for unavailable %s evidence, then safely retries', async mode => {
    if (mode === 'transfer') f.charge.transfer = null
    if (mode === 'fee') f.charge.application_fee = null
    if (mode === 'network') provider.intent.mockRejectedValueOnce(new Error('private Stripe transport details'))
    const response = await webhook()
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('private Stripe')
    expect((await payment()).status).toBe('PENDING')
    expect(await notices()).toHaveLength(0)
    f.charge.transfer = f.transfer.id; f.charge.application_fee = f.fee.id
    expect((await webhook()).status).toBe(200)
    expect((await booking()).status).toBe('CONFIRMED')
  })
  it.each(['checkout.session.completed', 'payment_intent.succeeded', 'payment_intent.payment_failed'])('ignores signed connected-account %s without SQL or provider crediting', async type => {
    expect((await webhook(type, 'acct_other')).status).toBe(200)
    expect(provider.intent).not.toHaveBeenCalled()
    expect((await payment()).status).toBe('PENDING')
    expect(await notices()).toHaveLength(0)
  })
  it('requires immutable destination evidence for a legacy paid session instead of trusting the current trainer account', async () => {
    await prisma.checkoutAttempt.delete({ where: { id: f.attempt.id } })
    delete f.intent.metadata.checkoutAttemptId
    expect((await webhook()).status).toBe(409)
    expect((await payment()).status).toBe('PENDING')
    expect(provider.intent).not.toHaveBeenCalled()
  })
  it('uses the saved destination even if the current trainer account changed after checkout creation', async () => {
    await prisma.trainerProfile.update({ where: { id: trainerProfileId }, data: { stripeAccountId: 'acct_new' } })
    expect((await webhook()).status).toBe(200)
    expect((await payment()).stripeTransferId).toBe(f.transfer.id)
  })
  it.each(['valid', 'wrong-destination'])('paid checkout recovery also runs settlement verification: %s', async mode => {
    if (mode === 'wrong-destination') f.transfer.destination = 'acct_other'
    await expect(startOrResumeCheckout(f.booking.id, { id: parentId }, 'acct_settlement')).rejects.toThrow(mode === 'valid' ? /already|processing/i : /transfer/i)
    expect(provider.transfer).toHaveBeenCalledOnce()
    expect((await payment()).status).toBe(mode === 'valid' ? 'SUCCEEDED' : 'PENDING')
    expect((await booking()).status).toBe(mode === 'valid' ? 'CONFIRMED' : 'PENDING')
  })
  it.each(['CANCELLED', 'RESCHEDULED'] as const)('records genuine late settlement without reopening %s', async status => {
    const admin = await prisma.user.create({ data: { email: `late-admin-${randomUUID()}@example.test`, role: 'ADMIN', passwordHash: 'not-a-login' } }); users.push(admin.id)
    await prisma.booking.update({ where: { id: f.booking.id }, data: { status } })
    const responses = await Promise.all([webhook(), webhook()])
    expect(responses.map(response => response.status)).toEqual([200, 200])
    expect((await webhook('payment_intent.succeeded', undefined, f.intent)).status).toBe(200)
    expect((await booking()).status).toBe(status)
    expect((await payment()).stripeTransferId).toBe(f.transfer.id)
    expect(await notices()).toHaveLength(2)
    expect((await notices()).every(item => item.type === 'PAYMENT_REVIEW_REQUIRED')).toBe(true)
    const inbox = await readNotifications(admin, { page: 1, limit: 50, view: 'all' })
    expect(inbox.notifications).toHaveLength(1)
    expect(inbox.notifications[0]).toMatchObject({ type: 'PAYMENT_REVIEW_REQUIRED', bookingId: f.booking.id,
      message: expect.stringContaining('cancelled or rescheduled') })
    await changeNotifications(admin, { ids: [inbox.notifications[0].id], read: true })
    expect((await webhook()).status).toBe(200)
    expect((await readNotifications(admin, { page: 1, limit: 50, view: 'unread' })).unreadCount).toBe(0)
    expect((await booking()).status).toBe(status)
  })
  it.each(['parent-deleted', 'trainer-deleted', 'both-deleted', 'parent-role', 'trainer-role'])('withholds late payment confirmation for revoked participants: %s', async mode => {
    const operator = await admin()
    const revoked = mode.startsWith('parent') ? [parentId] : mode.startsWith('trainer') ? [trainerId] : [parentId, trainerId]
    await prisma.user.updateMany({ where: { id: { in: revoked } }, data: mode.endsWith('role') ? { role: 'ADMIN' } : { deletedAt: new Date() } })
    expect((await webhook()).status).toBe(200)
    expect(await payment()).toMatchObject({ status: 'SUCCEEDED', stripeChargeId: f.charge.id, stripeTransferId: f.transfer.id })
    expect((await booking()).status).toBe('PENDING')
    const first = await independent.notification.findMany({ where: { userId: { in: [...revoked, operator, parentId, trainerId] } } })
    await expect(applyBookingAction(f.booking.id, { id: operator, role: 'ADMIN' }, { action: 'confirm' })).rejects.toMatchObject({ status: 409 })
    expect((await booking()).status).toBe('PENDING')
    expect(first.some(item => item.type === 'BOOKING_CONFIRMED' || item.type === 'PAYMENT_RECEIVED')).toBe(false)
    expect(first.filter(item => item.userId === operator)).toHaveLength(1)
    expect(first.find(item => item.userId === operator)?.message).toContain('account')
    if (mode.endsWith('deleted')) expect(first.some(item => revoked.includes(item.userId))).toBe(false)
    expect((await webhook()).status).toBe(200)
    expect(await independent.notification.count({ where: { userId: { in: [operator, parentId, trainerId] } } })).toBe(first.length)
    expect(await independent.walletEntry.count({ where: { bookingId: f.booking.id } })).toBe(0)
  })
  it.each(['parent', 'trainer', 'admin'])('rechecks %s revocation committed while account locks wait', async participant => {
    const operator = await admin()
    const userId = participant === 'parent' ? parentId : participant === 'trainer' ? trainerId : operator
    let release!: () => void, ready!: (pid: number) => void
    const locked = new Promise<number>(resolve => { ready = resolve })
    const writer = independent.$transaction(async tx => {
      const [backend] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`
      await tx.user.update({ where: { id: userId }, data: { deletedAt: new Date() } })
      const untilReleased = new Promise<void>(resolve => { release = resolve })
      ready(backend.pid)
      await untilReleased
    }, { timeout: 15000 })
    const holder = await locked
    const delivery = applyPaymentEvidence(evidence(), undefined, { adminUserId: operator }).then(() => null, error => error as Error)
    try {
      await expect.poll(async () => {
        const [waiting] = await independent.$queryRaw<Array<{ count: number }>>`SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE ${holder} = ANY(pg_blocking_pids(pid)) AND wait_event_type = 'Lock'`
        return waiting.count
      }, { timeout: 3000 }).toBeGreaterThan(0)
      expect(provider.intent).not.toHaveBeenCalled()
    } finally { release(); await writer }
    const result = await delivery
    expect((await booking()).status).toBe('PENDING')
    if (participant === 'admin') {
      expect(result?.message).toContain('Administrator access')
      expect(await payment()).toMatchObject({ status: 'PENDING', stripeChargeId: null, stripeTransferId: null })
      expect(await notices()).toHaveLength(0)
    } else {
      expect(result).toBeNull()
      expect((await payment()).status).toBe('SUCCEEDED')
      expect(await independent.notification.count({ where: { userId } })).toBe(0)
      expect(await independent.notification.count({ where: { userId: operator, type: 'PAYMENT_REVIEW_REQUIRED' } })).toBe(1)
    }
  })
  it.each(['parent', 'trainer', 'admin'])('holds %s authority through provider verification and commit', async participant => {
    const operator = await admin()
    const userId = participant === 'parent' ? parentId : participant === 'trainer' ? trainerId : operator
    let release!: () => void, ready!: () => void
    const verifying = new Promise<void>(resolve => { ready = resolve })
    provider.fee.mockImplementationOnce(async () => {
      const untilReleased = new Promise<void>(resolve => { release = resolve })
      ready()
      await untilReleased
      return structuredClone(f.fee)
    })
    const delivery = applyPaymentEvidence(evidence(), undefined, { adminUserId: operator })
    await verifying
    let writerReady!: (pid: number) => void
    const started = new Promise<number>(resolve => { writerReady = resolve })
    const writer = independent.$transaction(async tx => {
      const [backend] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`
      writerReady(backend.pid)
      await tx.user.update({ where: { id: userId }, data: { deletedAt: new Date() } })
    }, { timeout: 15000 })
    const writerPid = await started
    try {
      await expect.poll(async () => {
        const [waiting] = await independent.$queryRaw<Array<{ count: number }>>`SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE pid = ${writerPid} AND wait_event_type = 'Lock'`
        return waiting.count
      }, { timeout: 3000 }).toBe(1)
    } finally { release(); await delivery; await writer }
    expect((await booking()).status).toBe('CONFIRMED')
    expect((await payment()).status).toBe('SUCCEEDED')
    expect(await independent.adminAction.count({ where: { adminUserId: operator, actionType: 'RECONCILE_PAYMENT' } })).toBe(1)
  })
  it('flags account revocation on a paid replay once without rewriting an earlier confirmation', async () => {
    const operator = await admin()
    expect((await webhook()).status).toBe(200)
    await independent.user.update({ where: { id: trainerId }, data: { deletedAt: new Date() } })
    expect((await webhook()).status).toBe(200)
    expect((await webhook()).status).toBe(200)
    expect((await booking()).status).toBe('CONFIRMED')
    expect(await independent.notification.count({ where: { userId: operator, type: 'PAYMENT_REVIEW_REQUIRED' } })).toBe(1)
    expect(await independent.notification.count({ where: { userId: parentId, type: 'PAYMENT_REVIEW_REQUIRED' } })).toBe(1)
    expect(await independent.notification.count({ where: { userId: trainerId, type: 'PAYMENT_REVIEW_REQUIRED' } })).toBe(0)
  })
  it.each(['dispute', 'reversal', 'fee-refund'])('withholds confirmation for %s, records financial identities, and requests review', async mode => {
    if (mode === 'dispute') {
      f.charge.disputed = true
      f.disputes = [settlementDispute(f)]
    }
    if (mode === 'reversal') f.transfer.amount_reversed = 600
    if (mode === 'fee-refund') f.fee.amount_refunded = 100
    expect((await webhook()).status).toBe(200)
    expect((await webhook()).status).toBe(200)
    expect((await booking()).status).toBe('PENDING')
    expect((await payment()).stripeTransferId).toBe(f.transfer.id)
    const notifications = await notices()
    expect(notifications).toHaveLength(2)
    expect(notifications.every(item => item.type === 'PAYMENT_REVIEW_REQUIRED')).toBe(true)
  })
  for (const mode of ['dispute', 'reversal', 'fee-refund']) {
    it.each(['confirm', 'complete', 'no_show'] as const)(`blocks manual %s after ${mode} even when review notices are removed`, async action => {
      const operator = await admin()
      if (mode === 'dispute') f.disputes = [settlementDispute(f)]
      if (mode === 'reversal') f.transfer.amount_reversed = 600
      if (mode === 'fee-refund') f.fee.amount_refunded = 100
      expect((await webhook()).status).toBe(200)
      await prisma.notification.deleteMany({ where: { userId: { in: [operator, parentId, trainerId] } } })
      expect(await payment()).toMatchObject({ settlementVerifiedAt: expect.any(Date), financialReview: { key: expect.any(String) } })
      for (const actor of [{ id: parentId, role: 'PARENT' }, { id: trainerId, role: 'TRAINER' }]) {
        const result = await readDashboardBookings(actor, actor.role === 'PARENT' ? 'upcoming' : 'all', 1, 10)
        expect(result.bookings[0].payment).toMatchObject({ financialReview: true, settlementVerifiedAt: expect.any(Date) })
        expect(JSON.stringify(result)).not.toContain(f.charge.id)
      }
      if (action !== 'confirm') await prisma.booking.update({ where: { id: f.booking.id }, data: { status: 'CONFIRMED' } })
      const before = await booking()
      const clock = vi.spyOn(Date, 'now').mockReturnValue(new Date('2031-01-01').getTime())
      try {
        await expect(applyBookingAction(f.booking.id, { id: operator, role: 'ADMIN' }, { action })).rejects.toMatchObject({ status: 409 })
      } finally { clock.mockRestore() }
      expect(await booking()).toEqual(before)
      expect(await notices()).toHaveLength(0)
    })
  }
  it.each(['dispute', 'reversal', 'fee-refund'])('refund refresh persists %s review instead of bypassing the action hold', async mode => {
    const operator = await admin()
    await prisma.payment.update({ where: { id: f.booking.payment.id }, data: { stripePaymentIntentId: f.intent.id } })
    if (mode === 'dispute') f.disputes = [settlementDispute(f)]
    if (mode === 'reversal') f.transfer.amount_reversed = 600
    if (mode === 'fee-refund') f.fee.amount_refunded = 100
    await reconcilePaymentRefunds(f.booking.id, { adminUserId: operator })
    expect(await payment()).toMatchObject({ status: 'SUCCEEDED', settlementVerifiedAt: expect.any(Date), financialReview: { key: expect.any(String) } })
    await expect(applyBookingAction(f.booking.id, { id: operator, role: 'ADMIN' }, { action: 'confirm' })).rejects.toMatchObject({ status: 409 })
  })
  it('keeps stored review on provider failure; only fresh verified clean receipts clear it', async () => {
    f.transfer.amount_reversed = 600
    await webhook()
    const held = await payment()
    provider.transfer.mockRejectedValueOnce(new Error('synthetic provider failure'))
    expect((await webhook()).status).toBe(503)
    expect(await payment()).toEqual(held)
    // Synthetic clean receipt transition tests the reconciliation contract, not real reversal undo.
    f.transfer.amount_reversed = 0
    expect((await webhook()).status).toBe(200)
    expect(await payment()).toMatchObject({ financialReview: null, settlementVerifiedAt: expect.any(Date) })
    expect((await booking()).status).toBe('CONFIRMED')
  })
  it('requires legacy succeeded payments to be verified before manual confirmation', async () => {
    const operator = await admin()
    await prisma.payment.update({ where: { id: f.booking.payment.id }, data: { status: 'SUCCEEDED' } })
    await expect(applyBookingAction(f.booking.id, { id: operator, role: 'ADMIN' }, { action: 'confirm' })).rejects.toMatchObject({ status: 409 })
    await webhook()
    expect(await payment()).toMatchObject({ settlementVerifiedAt: expect.any(Date), financialReview: null })
    expect((await booking()).status).toBe('CONFIRMED')
  })
  it.each([1000, 6000])('reconciles an already-refunded charge (%s cents) on the first paid event, without confirming', async amount => {
    f.charge.amount_refunded = amount
    f.charge.refunded = amount === 6000
    provider.refunds.mockResolvedValue({ data: [{ id: 're_' + randomUUID(), charge: f.charge.id, payment_intent: f.intent.id,
      amount, currency: 'usd', status: 'succeeded', created: 1791440000 }], has_more: false })
    expect((await webhook()).status).toBe(200)
    expect((await webhook()).status).toBe(200)
    expect(await payment()).toMatchObject({ status: amount === 6000 ? 'REFUNDED' : 'PARTIALLY_REFUNDED', refundAmountInCents: amount })
    expect((await booking()).status).toBe(amount === 6000 ? 'CANCELLED' : 'PENDING')
    expect((await notices()).some(item => item.type === 'BOOKING_CONFIRMED')).toBe(false)
  })
  it('flags newly observed reversal on a later paid replay once without rewriting booking history', async () => {
    expect((await webhook()).status).toBe(200)
    f.transfer.amount_reversed = 1000
    expect((await webhook()).status).toBe(200)
    expect((await webhook()).status).toBe(200)
    const notifications = await notices()
    expect(notifications).toHaveLength(4)
    expect(notifications.filter(item => item.type === 'PAYMENT_REVIEW_REQUIRED')).toHaveLength(2)
    expect((await booking()).status).toBe('CONFIRMED')
  })
  it('rolls back paid identities and confirmation when refund reconciliation fails, then completes on retry', async () => {
    f.charge.amount_refunded = 6000; f.charge.refunded = true
    const refund = { id: 're_' + randomUUID(), charge: f.charge.id, payment_intent: f.intent.id, amount: 6000, currency: 'usd', status: 'succeeded', created: 1791440000 }
    provider.refunds.mockRejectedValueOnce(new Error('Stripe refund read unavailable')).mockResolvedValue({ data: [refund], has_more: false })
    expect((await webhook()).status).toBe(503)
    expect(await payment()).toMatchObject({ status: 'PENDING', stripePaymentIntentId: null, stripeChargeId: null, stripeTransferId: null })
    expect((await booking()).status).toBe('PENDING')
    expect((await notices()).some(item => item.type === 'BOOKING_CONFIRMED')).toBe(false)
    expect((await webhook()).status).toBe(200)
    expect((await payment()).status).toBe('REFUNDED')
    expect((await booking()).status).toBe('CANCELLED')
  })
})
