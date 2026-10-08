import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyPaymentEvidence, type PaymentEvidence } from '@/lib/stripe-payment-events'

const mock = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn(), notify: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: mock.transaction } }))

const paid: PaymentEvidence = {
  bookingId: 'booking', paymentId: 'payment', sessionId: 'cs_current', intentId: 'pi_current',
  amount: 7500, currency: 'usd', outcome: 'paid',
}
let state: any

beforeEach(() => {
  vi.resetAllMocks()
  state = {
    id: 'booking', status: 'PENDING', totalAmountInCents: 7500, date: new Date('2026-11-01'),
    payment: {
      id: 'payment', status: 'PENDING', amountInCents: 7500, platformFeeInCents: 1000,
      trainerPayoutInCents: 6500, refundAmountInCents: 0, stripeCheckoutSessionId: 'cs_current',
      stripePaymentIntentId: null, stripeChargeId: null,
    },
    parentProfile: { userId: 'parent' },
    trainerProfile: { userId: 'trainer', firstName: 'Test', lastName: 'Trainer' },
    notifications: [],
  }
  // This models transaction rollback; actual PostgreSQL locking is a separate integration gate.
  mock.transaction.mockImplementation(async (run) => {
    const before = structuredClone(state)
    try {
      return await run({
        $queryRaw: mock.query,
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
        notification: { createMany: async ({ data }: any) => {
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
  it('locks booking then payment before reading state and commits payment, confirmation and notifications', async () => {
    await applyPaymentEvidence(paid)
    expect(mock.query.mock.calls.map(([sql, id]) => [sql.join('?'), id])).toEqual([
      ['SELECT id FROM bookings WHERE id = ? FOR UPDATE', 'booking'],
      ['SELECT id FROM payments WHERE "bookingId" = ? FOR UPDATE', 'booking'],
    ])
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

  it('never regresses a cumulative refund or reopens a fully refunded booking', async () => {
    await applyPaymentEvidence(paid)
    await applyPaymentEvidence({ ...paid, outcome: 'refunded', refundAmount: 7500 })
    await applyPaymentEvidence({ ...paid, outcome: 'refunded', refundAmount: 1000 })
    await applyPaymentEvidence(paid)
    await applyPaymentEvidence({ ...paid, outcome: 'failed' })
    expect(state.status).toBe('CANCELLED')
    expect(state.payment.status).toBe('REFUNDED')
    expect(state.payment.refundAmountInCents).toBe(7500)
    expect(state.notifications).toHaveLength(2)
  })

  it('retains a partial refund when success arrives later', async () => {
    await applyPaymentEvidence({ ...paid, outcome: 'refunded', refundAmount: 1000 })
    await applyPaymentEvidence(paid)
    expect(state.payment.status).toBe('PARTIALLY_REFUNDED')
    expect(state.payment.refundAmountInCents).toBe(1000)
    expect(state.status).toBe('CONFIRMED')
    expect(state.notifications).toHaveLength(2)
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

  it.each([-1, 0, 7501, 0.5, undefined])('rejects invalid refund amount %s', async (refundAmount) => {
    await expect(applyPaymentEvidence({ ...paid, outcome: 'refunded', refundAmount })).rejects.toThrow('refund')
    expect(state.payment.refundAmountInCents).toBe(0)
  })

  it('does not invent a missing payment record from webhook metadata', async () => {
    state.payment = null
    await expect(applyPaymentEvidence(paid)).rejects.toThrow('reconciliation')
    expect(state.payment).toBeNull()
  })
})
