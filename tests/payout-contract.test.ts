import { describe, expect, it } from 'vitest'
import { payoutHistorySchema } from '@/lib/payout-contract'

const payout = { id: 'po_synthetic', amountInCents: 12345, currency: 'usd', status: 'paid', arrivalDate: 1791590400, createdAt: 1791504000 }
const connected = { source: 'stripe', connected: true, currency: 'usd', wallet: { availableBalance: -500, pendingBalance: 2000 }, schedule: { interval: 'daily' }, payouts: [payout] }

describe('trainer payout rendering contract', () => {
  it('accepts a verified balance including a negative Stripe balance', () => {
    expect(payoutHistorySchema.parse(connected).wallet?.availableBalance).toBe(-500)
  })
  it('accepts the actual unlinked wallet response', () => {
    expect(payoutHistorySchema.safeParse({ source: 'stripe', connected: false, wallet: null, payouts: [], schedule: null }).success).toBe(true)
  })
  it.each([
    { payouts: {} }, { payouts: null }, { schedule: { interval: 'unexpected' } },
    { wallet: { availableBalance: '123', pendingBalance: 0 } },
    ...[
      { currency: 'invalid-currency' }, { currency: '' }, { amountInCents: 1.5 },
      { amountInCents: Number.MAX_SAFE_INTEGER + 1 }, { status: 'done' },
      { arrivalDate: -1 }, { arrivalDate: Number.MAX_SAFE_INTEGER }, { createdAt: null },
    ].map(change => ({ payouts: [{ ...payout, ...change }] })),
  ])('rejects unsafe payout data %j', change => {
    expect(payoutHistorySchema.safeParse({ ...connected, ...change }).success).toBe(false)
  })
})
