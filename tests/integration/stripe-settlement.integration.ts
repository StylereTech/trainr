import { randomUUID } from 'node:crypto'
import Stripe from 'stripe'
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { applyPaymentEvidence } from '@/lib/stripe-payment-events'
import { startOrResumeCheckout } from '@/lib/checkout-attempts'
import { POST } from '@/app/api/payments/webhook/route'
import { settlementFixture, settlementDispute } from '../helpers/stripe-settlement-fixture'
import { changeNotifications, readNotifications } from '@/lib/notifications'

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
    startTime: '09:00', endTime: '10:00', totalAmountInCents: 6000, platformFeeInCents: 900, trainerPayoutInCents: 5100,
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
    await prisma.booking.deleteMany({ where: { id: { in: bookings } } })
    await prisma.user.deleteMany({ where: { id: { in: users } } })
    await prisma.sport.deleteMany({ where: { id: { in: sports } } })
  }
  await prisma.$disconnect()
  await independent.$disconnect()
})

describe('real settlement verifier, signatures, SQL and refund reconciliation with simulated Stripe receipts', () => {
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
    await prisma.payment.update({ where: { id: f.booking.payment.id }, data: { status: 'REFUNDED', refundAmountInCents: 6000 } })
    await prisma.booking.update({ where: { id: f.booking.id }, data: { status: 'CANCELLED' } })
    f.charge.refunded = true; f.charge.amount_refunded = 6000; f.transfer.amount_reversed = 6000
    provider.refunds.mockResolvedValue({ data: [{ id: 're_' + randomUUID(), charge: f.charge.id, payment_intent: f.intent.id,
      amount: 6000, currency: 'usd', status: 'succeeded', created: 1791440000 }], has_more: false })
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
  it('notifies only active admins and rolls the whole observation back when an admin notice fails', async () => {
    const active = await prisma.user.create({ data: { email: `active-${randomUUID()}@example.test`, role: 'ADMIN', passwordHash: 'not-a-login' } }); users.push(active.id)
    const deleted = await prisma.user.create({ data: { email: `deleted-${randomUUID()}@example.test`, role: 'ADMIN', passwordHash: 'not-a-login', deletedAt: new Date() } }); users.push(deleted.id)
    expect(verified).toBe(true)
    expect(active.id).toMatch(/^[a-z0-9]+$/)
    await independent.$executeRawUnsafe(`ALTER TABLE notifications ADD CONSTRAINT financial_admin_notification_failure CHECK ("userId" <> '${active.id}') NOT VALID`)
    f.transfer.amount_reversed = 1000
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
    expect((await booking()).status).toBe('PENDING')
  })
  it.each(['role', 'deactivation'])('does not disclose a new review to an admin whose %s change commits while delivery waits', async change => {
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
    f.transfer.amount_reversed = 1000
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
    await prisma.booking.update({ where: { id: f.booking.id }, data: { status } })
    expect((await webhook()).status).toBe(200)
    expect((await booking()).status).toBe(status)
    expect((await payment()).stripeTransferId).toBe(f.transfer.id)
    expect((await notices()).every(item => item.type === 'PAYMENT_REVIEW_REQUIRED')).toBe(true)
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
  it('retains linked identities and no confirmation when refund reconciliation fails, then completes on retry', async () => {
    f.charge.amount_refunded = 6000; f.charge.refunded = true
    const refund = { id: 're_' + randomUUID(), charge: f.charge.id, payment_intent: f.intent.id, amount: 6000, currency: 'usd', status: 'succeeded', created: 1791440000 }
    provider.refunds.mockRejectedValueOnce(new Error('Stripe refund read unavailable')).mockResolvedValue({ data: [refund], has_more: false })
    expect((await webhook()).status).toBe(503)
    expect(await payment()).toMatchObject({ stripePaymentIntentId: f.intent.id, stripeChargeId: f.charge.id, stripeTransferId: f.transfer.id })
    expect((await booking()).status).toBe('PENDING')
    expect((await notices()).some(item => item.type === 'BOOKING_CONFIRMED')).toBe(false)
    expect((await webhook()).status).toBe(200)
    expect((await payment()).status).toBe('REFUNDED')
    expect((await booking()).status).toBe('CANCELLED')
  })
})
