import { beforeEach, describe, expect, it, vi } from 'vitest'

// This suite isolates state transitions. stripe-settlement suites exercise the real verifier and provider receipt chain.
vi.mock('@/lib/stripe-settlement', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/stripe-settlement')>(),
  verifyDestinationSettlement: async (booking: any, _attempt: unknown, _intent: string, charge?: string | null) => ({
    chargeId: charge || booking.payment.stripeChargeId || 'ch_current',
    transferId: 'tr_synthetic', hasRefunds: false, requiresReview: false,
  }),
}))
import { applyPaymentEvidence, type PaymentEvidence } from '@/lib/stripe-payment-events'

const mock = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn(), notify: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: mock.transaction } }))
vi.mock('@/lib/stripe', () => ({ stripe: { refunds: { list: async () => ({ data: state.refunds.map((row: any) => ({
  id: row.id, charge: row.stripeChargeId, payment_intent: row.stripePaymentIntentId, currency: row.currency,
  amount: row.amountInCents, status: row.status.toLowerCase(), created: row.stripeCreatedAt.getTime() / 1000,
})), has_more: false }) } } }))

const paid: PaymentEvidence = {
  bookingId: 'booking', paymentId: 'payment', sessionId: 'cs_current', intentId: 'pi_current',
  amount: 7500, currency: 'usd', outcome: 'paid',
}
let state: any

beforeEach(() => {
  vi.resetAllMocks()
  mock.query.mockImplementation(async (sql: TemplateStringsArray) => sql.join('').includes('SELECT id, role, "deletedAt"') ? [
    { id: 'parent', role: 'PARENT', deletedAt: null }, { id: 'trainer', role: 'TRAINER', deletedAt: null },
  ] : [])
  state = {
    id: 'booking', status: 'PENDING', totalAmountInCents: 7500, date: new Date('2026-11-01'),
    payment: {
      id: 'payment', status: 'PENDING', amountInCents: 7500, platformFeeInCents: 1000,
      trainerPayoutInCents: 6500, refundAmountInCents: 0, refundPendingAmountInCents: 0, refundFailedCount: 0, stripeCheckoutSessionId: 'cs_current',
      stripePaymentIntentId: null, stripeChargeId: null,
    },
    parentProfile: { userId: 'parent' },
    trainerProfile: { userId: 'trainer', firstName: 'Test', lastName: 'Trainer' },
    notifications: [], refunds: [],
  }
  // This models transaction rollback; actual PostgreSQL locking is a separate integration gate.
  mock.transaction.mockImplementation(async (run) => {
    const before = structuredClone(state)
    try {
      return await run({
        $queryRaw: mock.query,
        accountCheckoutClosure: { findFirst: async () => state.closure || null },
        checkoutAttempt: {
          findFirst: async () => state.attempt || null,
          update: async ({ data }: any) => Object.assign(state.attempt, data),
        },
        booking: {
          findUnique: async () => structuredClone(state),
          updateMany: async ({ where, data }: any) => {
            const statuses = typeof where.status === 'string' ? [where.status] : where.status.in
            if (!statuses.includes(state.status)) return { count: 0 }
            Object.assign(state, data)
            return { count: 1 }
          },
        },
        payment: { update: async ({ data }: any) => Object.assign(state.payment, data) },
        paymentRefund: { findMany: async () => structuredClone(state.refunds), upsert: async ({ create, update }: any) => {
          const old = state.refunds.find((row: any) => row.id === create.id)
          if (old) { Object.assign(old, update, { paymentId: old.paymentId }); return old }
          state.refunds.push(create); return create
        } },
        notification: { findFirst: async ({ where }: any) => state.notifications.find((item: any) =>
          item.type === where.type && item.data.financialReviewKey === where.AND[1].data.equals) || null, createMany: async ({ data }: any) => {
          await mock.notify(data)
          state.notifications.push(...data)
        } },
      })
    } catch (error) {
      state = before
      throw error
    }
  })
})

describe('transactional Stripe payment evidence', () => {
  it.each(['PENDING', 'REVIEW'])('records captured funds but does not confirm a reinstated booking with %s checkout retirement', async status => {
    state.closure = { status }
    await applyPaymentEvidence(paid)
    expect(state.payment.status).toBe('SUCCEEDED')
    expect(state.status).toBe('PENDING')
    expect(state.payment.financialReview.details.participantReview).toContain('checkout_retirement_pending')
  })
  it('locks accounts before booking then payment and commits payment, confirmation and notifications', async () => {
    await applyPaymentEvidence(paid)
    expect(mock.query.mock.calls.slice(1, 4).map(([sql, id]) => [sql.join('?'), id])).toEqual([
      ['SELECT id FROM trainer_profiles WHERE id = (SELECT "trainerProfileId" FROM bookings WHERE id = ?) FOR SHARE', 'booking'],
      ['SELECT id FROM bookings WHERE id = ? FOR UPDATE', 'booking'],
      ['SELECT id FROM payments WHERE "bookingId" = ? FOR UPDATE', 'booking'],
    ])
    expect(mock.query.mock.calls[0][0].join('?')).toContain('ORDER BY id FOR SHARE')
    expect(state.payment.status).toBe('SUCCEEDED')
    expect(state.status).toBe('CONFIRMED')
    expect(state.notifications).toHaveLength(2)
    expect(state.payment.trainerPayoutInCents).toBe(6500)
  })

  it.each(['session-first', 'intent-first'])('fulfills once across distinct success events and replay: %s', async (order) => {
    const intent = { ...paid, sessionId: undefined, chargeId: 'ch_current' }
    const events = order === 'intent-first' ? [intent, paid, intent, paid] : [paid, intent, paid, intent]
    for (const event of events) await applyPaymentEvidence(event)
    expect(state.notifications).toHaveLength(2)
    expect(state.payment.stripeChargeId).toBe('ch_current')
    expect(state.payment.stripeCheckoutSessionId).toBe('cs_current')
  })

  it('rolls back financial state when notification persistence fails, then permits a clean retry', async () => {
    mock.notify.mockRejectedValueOnce(new Error('database unavailable'))
    await expect(applyPaymentEvidence(paid)).rejects.toThrow('database unavailable')
    expect(state.status).toBe('PENDING')
    expect(state.payment.status).toBe('PENDING')
    expect(state.notifications).toHaveLength(0)
    await applyPaymentEvidence(paid)
    expect(state.notifications).toHaveLength(2)
  })

  it.each(['CANCELLED', 'RESCHEDULED', 'COMPLETED', 'NO_SHOW'])('does not reopen a %s booking on late payment', async (status) => {
    state.status = status
    await applyPaymentEvidence(paid)
    await applyPaymentEvidence(paid)
    expect(state.status).toBe(status)
    expect(state.payment.status).toBe('SUCCEEDED')
    expect(state.notifications.some((item: any) => item.type === 'BOOKING_CONFIRMED')).toBe(false)
    if (['CANCELLED', 'RESCHEDULED'].includes(status)) {
      expect(state.notifications).toHaveLength(2)
      expect(state.notifications.every((item: any) => item.type === 'PAYMENT_REVIEW_REQUIRED')).toBe(true)
    }
  })

  it('ignores failure after success but permits successful retry of the same intent', async () => {
    await applyPaymentEvidence({ ...paid, outcome: 'failed' })
    expect(state.payment.status).toBe('FAILED')
    await applyPaymentEvidence(paid)
    await applyPaymentEvidence({ ...paid, outcome: 'failed' })
    expect(state.payment.status).toBe('SUCCEEDED')
    expect(state.notifications).toHaveLength(2)
  })

  it('late settlement never overwrites a refund established by reconciliation', async () => {
    await applyPaymentEvidence(paid)
    state.payment.status = 'REFUNDED'
    state.payment.refundAmountInCents = 7500
    state.refunds = [{ id: 're_full', paymentId: 'payment', stripeChargeId: 'ch_current', stripePaymentIntentId: 'pi_current',
      amountInCents: 7500, currency: 'usd', status: 'SUCCEEDED', stripeCreatedAt: new Date('2026-10-01') }]
    state.status = 'CANCELLED'
    await applyPaymentEvidence(paid)
    await applyPaymentEvidence({ ...paid, outcome: 'failed' })
    expect(state.status).toBe('CANCELLED')
    expect(state.payment.status).toBe('REFUNDED')
    expect(state.payment.refundAmountInCents).toBe(7500)
    expect(state.notifications).toHaveLength(4)
  })

  it('retains a partial refund when success arrives later', async () => {
    state.payment.status = 'PARTIALLY_REFUNDED'
    state.payment.refundAmountInCents = 1000
    state.refunds = [{ id: 're_partial', paymentId: 'payment', stripeChargeId: 'ch_current', stripePaymentIntentId: 'pi_current',
      amountInCents: 1000, currency: 'usd', status: 'SUCCEEDED', stripeCreatedAt: new Date('2026-10-01') }]
    await applyPaymentEvidence(paid)
    expect(state.payment.status).toBe('PARTIALLY_REFUNDED')
    expect(state.payment.refundAmountInCents).toBe(1000)
    expect(state.status).toBe('PENDING')
    expect(state.notifications).toHaveLength(2)
    expect(state.notifications.every((item: any) => item.type === 'PAYMENT_REVIEW_REQUIRED')).toBe(true)
    await applyPaymentEvidence(paid)
    expect(state.notifications).toHaveLength(2)
  })

  it.each([
    { paymentId: 'different-payment' }, { sessionId: 'cs_other' }, { intentId: null },
    { currency: 'eur' }, { amount: 1 },
  ])('rejects mismatched evidence without mutation: %j', async (change) => {
    await expect(applyPaymentEvidence({ ...paid, ...change })).rejects.toThrow()
    expect(state.payment.status).toBe('PENDING')
    expect(state.notifications).toHaveLength(0)
  })

  it('rejects a different intent or charge after payment is linked', async () => {
    await applyPaymentEvidence({ ...paid, chargeId: 'ch_current' })
    await expect(applyPaymentEvidence({ ...paid, intentId: 'pi_other' })).rejects.toThrow('identity')
    await expect(applyPaymentEvidence({ ...paid, chargeId: 'ch_other' })).rejects.toThrow('identity')
  })

  it('requires a durable linkage, not booking metadata alone', async () => {
    state.payment.stripeCheckoutSessionId = null
    await expect(applyPaymentEvidence({ ...paid, paymentId: undefined })).rejects.toThrow('not linked')
    await applyPaymentEvidence(paid)
    expect(state.payment.stripeCheckoutSessionId).toBe('cs_current')
  })

  it.each([-1, 0, 1000, 7500, 7501, 0.5, undefined])('refuses raw cumulative refund snapshot %s without provider reconciliation', async (refundAmount) => {
    await expect(applyPaymentEvidence({ ...paid, outcome: 'refunded', refundAmount })).rejects.toThrow('refund')
    expect(state.payment.refundAmountInCents).toBe(0)
  })

  it('does not invent a missing payment record from webhook metadata', async () => {
    state.payment = null
    await expect(applyPaymentEvidence(paid)).rejects.toThrow('reconciliation')
    expect(state.payment).toBeNull()
  })

  it('rejects late evidence from a retired attempt even with the same payment metadata', async () => {
    state.attempt = { id: 'new-attempt', stripeCheckoutSessionId: null, retiredAt: null }
    state.payment.stripeCheckoutSessionId = null
    await expect(applyPaymentEvidence({ ...paid, attemptId: 'old-attempt' })).rejects.toThrow('different checkout attempt')
    await expect(applyPaymentEvidence(paid)).rejects.toThrow('different checkout attempt')
    expect(state.payment.status).toBe('PENDING')
  })

  it('recovers an attempt session ID when the webhook beats checkout finalization', async () => {
    state.attempt = { id: 'current-attempt', stripeCheckoutSessionId: null, retiredAt: null }
    state.payment.stripeCheckoutSessionId = null
    await applyPaymentEvidence({ ...paid, attemptId: 'current-attempt' })
    expect(state.attempt.stripeCheckoutSessionId).toBe('cs_current')
    expect(state.payment.status).toBe('SUCCEEDED')
  })
})
