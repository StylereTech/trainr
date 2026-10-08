import { randomUUID } from 'node:crypto'
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { reconcilePaymentRefunds, reconcileRefundEvent } from '@/lib/refund-reconciliation'
import { applyPaymentEvidence } from '@/lib/stripe-payment-events'

const provider = vi.hoisted(() => ({ charge: vi.fn(), refunds: vi.fn(), intent: vi.fn() }))
vi.mock('@/lib/stripe', () => ({ stripe: { charges: { retrieve: provider.charge }, refunds: { list: provider.refunds }, paymentIntents: { retrieve: provider.intent } } }))
const independent = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL })
const users: string[] = [], sports: string[] = [], bookings: string[] = []
let verified = false
let f: { booking: string; payment: string; parent: string; trainer: string; admin: string; charge: string; intent: string }
let charge: Record<string, any>
let refunds: Array<Record<string, any>>
const refund = (status = 'succeeded', amount = 6000, id = `re_${randomUUID()}`) => ({ id, status, amount, charge: f.charge, payment_intent: f.intent, currency: 'usd', created: 1791440000 })
const reconcile = () => reconcilePaymentRefunds(f.booking, { adminUserId: f.admin })
const payment = () => independent.payment.findUniqueOrThrow({ where: { id: f.payment } })
const ledger = () => independent.paymentRefund.findMany({ where: { paymentId: f.payment } })

beforeAll(async () => {
  expect(await prisma.$queryRaw`SELECT current_database() AS database`).toEqual([{ database: expect.stringMatching(/^trainr_audit_/) }])
  expect(await prisma.$queryRaw`SELECT purpose FROM trainr_test_guard`).toEqual([{ purpose: 'disposable integration database' }])
  verified = true
})
beforeEach(async () => {
  vi.resetAllMocks()
  const id = randomUUID()
  const sport = await prisma.sport.create({ data: { name: id, slug: id } }); sports.push(sport.id)
  const parent = await prisma.user.create({ data: { email: `${id}-parent@example.test`, role: 'PARENT', passwordHash: 'not-a-login', parentProfile: { create: { athletes: { create: { firstName: 'Synthetic', lastName: 'Athlete', dateOfBirth: new Date('2015-01-01') } } } } }, include: { parentProfile: { include: { athletes: true } } } }); users.push(parent.id)
  const trainer = await prisma.user.create({ data: { email: `${id}-trainer@example.test`, role: 'TRAINER', passwordHash: 'not-a-login', trainerProfile: { create: { firstName: 'Synthetic', lastName: 'Trainer', slug: id, serviceOfferings: { create: { title: 'Synthetic session', sportId: sport.id, priceInCents: 6000, durationMinutes: 60 } } } } }, include: { trainerProfile: { include: { serviceOfferings: true } } } }); users.push(trainer.id)
  const admin = await prisma.user.create({ data: { email: `${id}-admin@example.test`, role: 'ADMIN', passwordHash: 'not-a-login' } }); users.push(admin.id)
  const booking = await prisma.booking.create({ data: { parentProfileId: parent.parentProfile!.id, athleteProfileId: parent.parentProfile!.athletes[0].id, trainerProfileId: trainer.trainerProfile!.id, serviceOfferingId: trainer.trainerProfile!.serviceOfferings[0].id, date: new Date('2030-11-04'), startTime: '09:00', endTime: '10:00', totalAmountInCents: 6000, platformFeeInCents: 900, trainerPayoutInCents: 5100, status: 'CONFIRMED', payment: { create: { amountInCents: 6000, platformFeeInCents: 900, trainerPayoutInCents: 5100, status: 'SUCCEEDED', stripeChargeId: `ch_${id}`, stripePaymentIntentId: `pi_${id}` } } }, include: { payment: true } }); bookings.push(booking.id)
  f = { booking: booking.id, payment: booking.payment!.id, parent: parent.id, trainer: trainer.id, admin: admin.id, charge: `ch_${id}`, intent: `pi_${id}` }
  charge = { id: f.charge, payment_intent: f.intent, paid: true, captured: true, currency: 'usd', amount: 6000, metadata: { bookingId: f.booking, paymentId: f.payment } }
  refunds = [refund()]
  provider.charge.mockImplementation(async () => structuredClone(charge))
  provider.refunds.mockImplementation(async () => ({ data: structuredClone(refunds), has_more: false }))
  provider.intent.mockResolvedValue({ id: f.intent, status: 'succeeded', amount_received: 6000, currency: 'usd', latest_charge: f.charge })
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

describe('refund reconciliation with real PostgreSQL and simulated Stripe reads', () => {
  it('commits a full successful refund, cancellation, notifications and audit once across concurrent deliveries', async () => {
    await Promise.all([reconcile(), reconcile()])
    await reconcileRefundEvent(f.charge, refunds[0].id)
    expect(await payment()).toMatchObject({ status: 'REFUNDED', refundAmountInCents: 6000, refundPendingAmountInCents: 0, refundFailedCount: 0, refundsVerifiedAt: expect.any(Date) })
    expect(await ledger()).toHaveLength(1)
    expect((await independent.booking.findUniqueOrThrow({ where: { id: f.booking } })).status).toBe('CANCELLED')
    expect(await independent.notification.count({ where: { userId: { in: [f.parent, f.trainer] } } })).toBe(2)
    expect(await independent.adminAction.count({ where: { adminUserId: f.admin } })).toBe(1)
  })
  it.each(['pending', 'requires_action'])('does not count %s as money returned', async status => {
    refunds = [refund(status)]
    expect(await reconcile()).toMatchObject({ status: 'SUCCEEDED', refundedAmountInCents: 0, pendingAmountInCents: 6000 })
    expect((await independent.booking.findUniqueOrThrow({ where: { id: f.booking } })).status).toBe('CONFIRMED')
    expect(await independent.notification.count({ where: { userId: f.admin, type: 'PAYMENT_REVIEW_REQUIRED' } })).toBe(1)
  })
  it.each(['failed', 'canceled'])('corrects a previously successful refund that is now %s without reopening the booking', async status => {
    await reconcile()
    refunds[0].status = status
    refunds[0].failure_balance_transaction = 'txn_failure'
    refunds[0].failure_reason = 'lost_or_stolen_card'
    await reconcile()
    expect(await payment()).toMatchObject({ status: 'SUCCEEDED', refundAmountInCents: 0, refundFailedCount: 1 })
    expect((await ledger())[0]).toMatchObject({ failureBalanceTransactionId: 'txn_failure', failureReason: 'lost_or_stolen_card' })
    expect((await independent.booking.findUniqueOrThrow({ where: { id: f.booking } })).status).toBe('CANCELLED')
    await applyPaymentEvidence({ bookingId: f.booking, paymentId: f.payment, intentId: f.intent, amount: 6000, currency: 'usd', outcome: 'paid' })
    expect((await independent.booking.findUniqueOrThrow({ where: { id: f.booking } })).status).toBe('CANCELLED')
  })
  it('aggregates mixed outcomes and keeps completed session history', async () => {
    await prisma.booking.update({ where: { id: f.booking }, data: { status: 'COMPLETED' } })
    refunds = [refund('succeeded', 2000), refund('pending', 1000), refund('failed', 6000), refund('canceled', 6000)]
    refunds[0].transfer_reversal = { id: 'trr_synthetic' }
    expect(await reconcile()).toMatchObject({ status: 'PARTIALLY_REFUNDED', refundedAmountInCents: 2000, pendingAmountInCents: 1000, failedCount: 2 })
    refunds[0].amount = 2000
    refunds[1].status = 'succeeded'
    refunds.push(refund('succeeded', 3000))
    await reconcile()
    expect((await payment()).status).toBe('REFUNDED')
    expect((await independent.booking.findUniqueOrThrow({ where: { id: f.booking } })).status).toBe('COMPLETED')
  })
  it('uses current provider truth for delayed events and never trusts the event amount', async () => {
    refunds = [refund('pending')]
    await reconcileRefundEvent(f.charge, refunds[0].id)
    refunds[0].status = 'failed'
    await reconcileRefundEvent(f.charge, refunds[0].id)
    await reconcileRefundEvent(f.charge, refunds[0].id)
    expect(await payment()).toMatchObject({ refundAmountInCents: 0, refundPendingAmountInCents: 0, refundFailedCount: 1 })
  })
  it('keeps a pending booking unconfirmed when late settlement arrives during a pending refund', async () => {
    await prisma.booking.update({ where: { id: f.booking }, data: { status: 'PENDING' } })
    refunds = [refund('pending')]
    await reconcile()
    await applyPaymentEvidence({ bookingId: f.booking, paymentId: f.payment, intentId: f.intent, amount: 6000, currency: 'usd', outcome: 'paid' })
    expect((await independent.booking.findUniqueOrThrow({ where: { id: f.booking } })).status).toBe('PENDING')
  })
  it('resolves an absent charge ID from the verified payment intent', async () => {
    await prisma.payment.update({ where: { id: f.payment }, data: { stripeChargeId: null } })
    await reconcile()
    expect(provider.intent).toHaveBeenCalledOnce()
    expect((await payment()).stripeChargeId).toBe(f.charge)
  })
  it('rejects an early refund before payment identity is saved and succeeds after linking', async () => {
    await prisma.payment.update({ where: { id: f.payment }, data: { stripePaymentIntentId: null } })
    await expect(reconcileRefundEvent(f.charge, refunds[0].id)).rejects.toMatchObject({ status: 409 })
    expect(await ledger()).toHaveLength(0)
    await prisma.payment.update({ where: { id: f.payment }, data: { stripePaymentIntentId: f.intent } })
    await expect(reconcileRefundEvent(f.charge, refunds[0].id)).resolves.toMatchObject({ status: 'REFUNDED' })
  })
  it.each([{ amount: 6001 }, { currency: 'eur' }, { paid: false }, { captured: false }, { payment_intent: 'pi_other' }, { metadata: { bookingId: 'other' } }])('rejects mismatched charge %j without mutation', async patch => {
    Object.assign(charge, patch)
    await expect(reconcile()).rejects.toMatchObject({ status: 409 })
    expect(await ledger()).toHaveLength(0)
    expect((await payment()).refundsVerifiedAt).toBeNull()
  })
  it.each([{ amount: 0 }, { amount: 6001 }, { amount: 1.5 }, { currency: 'eur' }, { status: null }, { status: 'toString' }, { status: 'unknown' }, { charge: 'ch_other' }, { payment_intent: 'pi_other' }, { created: -1 }, { created: Number.MAX_SAFE_INTEGER }])('rejects invalid refund %j atomically', async patch => {
    Object.assign(refunds[0], patch)
    await expect(reconcile()).rejects.toMatchObject({ status: 409 })
    expect(await ledger()).toHaveLength(0)
    expect((await payment()).refundAmountInCents).toBe(0)
  })
  it('rejects successful plus pending amounts exceeding the charge', async () => {
    refunds = [refund('succeeded', 4000), refund('pending', 3000)]
    await expect(reconcile()).rejects.toMatchObject({ status: 409 })
    expect(await ledger()).toHaveLength(0)
  })
  it('rejects missing or changed previously recorded refunds', async () => {
    await reconcile()
    const original = refunds[0]
    refunds = []
    await expect(reconcile()).rejects.toThrow('missing')
    refunds = [{ ...original, amount: 2000 }]
    await expect(reconcile()).rejects.toThrow('immutable')
    expect((await payment()).refundAmountInCents).toBe(6000)
  })
  it('requires the webhook-triggering refund to exist in the provider list', async () => {
    await expect(reconcileRefundEvent(f.charge, 're_missing')).rejects.toThrow('triggering refund')
    expect(await ledger()).toHaveLength(0)
  })
  it('loads all pages before calculating totals', async () => {
    refunds = [refund('succeeded', 2000), refund('succeeded', 4000)]
    provider.refunds.mockResolvedValueOnce({ data: [refunds[0]], has_more: true }).mockResolvedValueOnce({ data: [refunds[1]], has_more: false })
    await reconcile()
    expect(provider.refunds.mock.calls[1][0].starting_after).toBe(refunds[0].id)
    expect(await ledger()).toHaveLength(2)
    expect((await payment()).refundAmountInCents).toBe(6000)
  })
  it.each(['duplicate', 'empty', 'limit', 'provider-error'])('fails closed on %s pagination', async mode => {
    let page = 0
    provider.refunds.mockImplementation(async () => {
      if (mode === 'provider-error') throw new Error('synthetic provider failure')
      return { data: mode === 'empty' ? [] : [mode === 'limit' ? refund('failed', 6000, `re_page_${page++}`) : refunds[0]], has_more: true }
    })
    await expect(reconcile()).rejects.toThrow()
    expect(await ledger()).toHaveLength(0)
    expect((await payment()).refundsVerifiedAt).toBeNull()
  })
  it.each(['audit', 'notification'])('rolls back every financial write if the %s SQL constraint fails', async target => {
    const table = target === 'audit' ? 'admin_actions' : 'notifications'
    const column = target === 'audit' ? 'targetId' : 'userId'
    const value = target === 'audit' ? f.payment : f.parent
    await independent.$executeRawUnsafe(`ALTER TABLE ${table} ADD CONSTRAINT trainr_refund_failure CHECK ("${column}" <> '${value}') NOT VALID`)
    try {
      await expect(reconcile()).rejects.toThrow()
      expect(await ledger()).toHaveLength(0)
      expect((await payment()).refundsVerifiedAt).toBeNull()
      expect((await independent.booking.findUniqueOrThrow({ where: { id: f.booking } })).status).toBe('CONFIRMED')
      expect(await independent.notification.count({ where: { userId: { in: [f.parent, f.trainer] } } })).toBe(0)
    } finally { await independent.$executeRawUnsafe(`ALTER TABLE ${table} DROP CONSTRAINT trainr_refund_failure`) }
    await expect(reconcile()).resolves.toMatchObject({ status: 'REFUNDED' })
  })
  it.each(['revoked', 'closed'])('rechecks a %s admin inside the transaction', async state => {
    await prisma.user.update({ where: { id: f.admin }, data: state === 'revoked' ? { role: 'PARENT' } : { deletedAt: new Date() } })
    await expect(reconcile()).rejects.toMatchObject({ status: 403 })
    expect(provider.charge).not.toHaveBeenCalled()
    expect(await ledger()).toHaveLength(0)
  })
  it('ignores foreign charges but retries unlinked TRAINR metadata', async () => {
    charge = { ...charge, id: 'ch_foreign', payment_intent: 'pi_foreign', metadata: {} }
    await expect(reconcileRefundEvent('ch_foreign')).resolves.toEqual({ ignored: true })
    charge.metadata = { bookingId: 'not-linked-yet' }
    await expect(reconcileRefundEvent('ch_foreign')).rejects.toMatchObject({ status: 409 })
  })

  it('rolls back a refund ID collision without reassigning its existing payment owner', async () => {
    const original = await prisma.booking.findUniqueOrThrow({ where: { id: f.booking } })
    const other = await prisma.booking.create({ data: { parentProfileId: original.parentProfileId, trainerProfileId: original.trainerProfileId, athleteProfileId: original.athleteProfileId, serviceOfferingId: original.serviceOfferingId, date: original.date, startTime: '11:00', endTime: '12:00', totalAmountInCents: 6000, platformFeeInCents: 900, trainerPayoutInCents: 5100, payment: { create: { amountInCents: 6000, platformFeeInCents: 900, trainerPayoutInCents: 5100 } } }, include: { payment: true } })
    bookings.push(other.id)
    await prisma.paymentRefund.create({ data: { id: refunds[0].id, paymentId: other.payment!.id, stripeChargeId: 'ch_other', stripePaymentIntentId: 'pi_other', amountInCents: 1000, currency: 'usd', status: 'PENDING', stripeCreatedAt: new Date(), observedAt: new Date() } })
    await expect(reconcile()).rejects.toThrow('different payment')
    expect(await independent.paymentRefund.findUniqueOrThrow({ where: { id: refunds[0].id } })).toMatchObject({ paymentId: other.payment!.id, stripeChargeId: 'ch_other', amountInCents: 1000, status: 'PENDING' })
    expect((await payment()).refundsVerifiedAt).toBeNull()
  })

  it('rejects ambiguous charge mappings instead of refunding either local payment', async () => {
    const original = await prisma.booking.findUniqueOrThrow({ where: { id: f.booking } })
    const other = await prisma.booking.create({ data: { parentProfileId: original.parentProfileId, trainerProfileId: original.trainerProfileId, athleteProfileId: original.athleteProfileId, serviceOfferingId: original.serviceOfferingId, date: original.date, startTime: '11:00', endTime: '12:00', totalAmountInCents: 6000, platformFeeInCents: 900, trainerPayoutInCents: 5100, payment: { create: { amountInCents: 6000, platformFeeInCents: 900, trainerPayoutInCents: 5100, stripePaymentIntentId: f.intent } } }, include: { payment: true } })
    bookings.push(other.id)
    await expect(reconcileRefundEvent(f.charge)).rejects.toThrow('multiple payments')
    expect(await ledger()).toHaveLength(0)
  })

  it('serializes the provider read so a slower earlier observation cannot overwrite a later failure', async () => {
    let release!: () => void, observed!: () => void
    const blocked = new Promise<void>(resolve => { release = resolve })
    const reading = new Promise<void>(resolve => { observed = resolve })
    let reads = 0
    provider.refunds.mockImplementation(async () => {
      if (++reads === 1) { const snapshot = structuredClone(refunds); observed(); await blocked; return { data: snapshot, has_more: false } }
      return { data: structuredClone(refunds), has_more: false }
    })
    const first = reconcile()
    await reading
    const second = reconcile()
    refunds[0].status = 'failed'
    release()
    await Promise.all([first, second])
    expect(reads).toBe(2)
    expect(await payment()).toMatchObject({ refundAmountInCents: 0, refundFailedCount: 1, status: 'SUCCEEDED' })
    expect((await ledger())[0].status).toBe('FAILED')
  })
})
