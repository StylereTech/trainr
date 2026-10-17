import { describe, expect, it } from 'vitest'
import { financialReviewSchema, notificationActionSchema, notificationDetails, notificationQuerySchema } from '@/lib/notification-contract'

describe('notification contracts', () => {
  it.each([{}, { ids: [], read: true }, { ids: ['a', 'a'], read: true }, { ids: ['a'], read: 'true' },
    { markAllRead: true }, { ids: ['a'], read: true, userId: 'other' }, { ids: Array.from({ length: 51 }, (_, i) => String(i)), read: true }])('rejects invalid or broad write %j', input => {
    expect(notificationActionSchema.safeParse(input).success).toBe(false)
  })
  it.each([{ page: 0 }, { page: 1.5 }, { page: 100001 }, { limit: 51 }, { view: 'other' }, { userId: 'other' }])('rejects invalid filters %j', input => {
    expect(notificationQuerySchema.safeParse(input).success).toBe(false)
  })
  it('defaults to a bounded first page', () => expect(notificationQuerySchema.parse({})).toEqual({ page: 1, limit: 20, view: 'all' }))
  it('does not expose arbitrary notification metadata', () => {
    expect(notificationDetails({ bookingId: 'booking', url: 'javascript:bad', private: 'secret' })).toEqual({ bookingId: 'booking', financialReview: null, reviewUnavailable: false })
  })
  it('marks malformed financial details unavailable rather than a zero balance', () => {
    expect(notificationDetails({ financialReview: { refundedInCents: 'wrong' } })).toEqual({ bookingId: null, financialReview: null, reviewUnavailable: true })
  })
  it('strips private evidence and rejects an unrenderable deadline', () => {
    const input = { chargeId: 'ch_1', transferId: 'tr_1', feeId: null, destination: 'acct_1', refundedInCents: 0, transferReversedInCents: 10, feeRefundedInCents: 0,
      private: 'secret', disputes: [{ id: 'du_1', status: 'needs_response', amountInCents: 6000, dueBy: 1792000000, balanceTransactions: [], evidence: 'private' }] }
    const parsed = financialReviewSchema.parse(input)
    expect(JSON.stringify(parsed)).not.toContain('private')
    input.disputes[0].dueBy = Number.MAX_SAFE_INTEGER
    expect(financialReviewSchema.safeParse(input).success).toBe(false)
  })
})
