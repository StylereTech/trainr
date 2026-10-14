import { describe, expect, it } from 'vitest'
import { paymentFinancialReview } from '@/lib/payment-financial-review'

const clean = { requiresReview: false, review: null }
const zero = { succeeded: 0, pending: 0, failed: 0 }

describe('consistent payment review across paid and refund refresh paths', () => {
  it('leaves a verified clean observation unheld', () => {
    expect(paymentFinancialReview('booking', clean, zero, [])).toEqual({ review: null, refundActivity: false, requiresReview: false })
  })
  it('preserves a provider-only review identity', () => {
    const review = { key: 'provider-review', details: { disputed: true } }
    expect(paymentFinancialReview('booking', { requiresReview: true, review }, zero, [])).toEqual({ review, refundActivity: false, requiresReview: true })
  })
  it.each([{ succeeded: 1000, pending: 0, failed: 0 }, { succeeded: 0, pending: 1000, failed: 0 }, { succeeded: 0, pending: 0, failed: 1 }])('holds refund activity %j with a repeatable identity', totals => {
    const first = paymentFinancialReview('booking', clean, totals, [])
    expect(first).toMatchObject({ requiresReview: true, refundActivity: true, review: { key: expect.any(String), details: {
      participantReview: [], paymentRefunds: { refundedInCents: totals.succeeded, pendingInCents: totals.pending, failedCount: totals.failed },
    } } })
    expect(paymentFinancialReview('booking', clean, { ...totals }, [])).toEqual(first)
  })
  it('retains participant restrictions alongside provider details even without refunds', () => {
    const result = paymentFinancialReview('booking', { requiresReview: true, review: { key: 'old', details: { disputed: true } } }, zero, ['checkout_retirement_pending'])
    expect(result).toMatchObject({ requiresReview: true, refundActivity: false, review: { details: {
      disputed: true, participantReview: ['checkout_retirement_pending'], paymentRefunds: { refundedInCents: 0, pendingInCents: 0, failedCount: 0 },
    } } })
    expect(result.review?.key).not.toBe('old')
  })
  it('changes identity when the booking or participant restriction changes', () => {
    const first = paymentFinancialReview('booking', clean, zero, ['checkout_retirement_pending'])
    expect(paymentFinancialReview('other-booking', clean, zero, ['checkout_retirement_pending']).review?.key).not.toBe(first.review?.key)
    expect(paymentFinancialReview('booking', clean, zero, ['parent_account_unavailable']).review?.key).not.toBe(first.review?.key)
  })
})
