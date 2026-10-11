import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe'

export class RefundReconciliationError extends Error {
  constructor(message: string, public readonly status = 409) { super(message) }
}

export async function loadRefunds(chargeId: string) {
  const refunds: Stripe.Refund[] = []
  let cursor: string | undefined
  const seen = new Set<string>()
  for (let page = 0; page < 10; page++) {
    const batch = await stripe.refunds.list({ charge: chargeId, limit: 100, ...(cursor ? { starting_after: cursor } : {}) }, { timeout: 4000, maxNetworkRetries: 0 })
    for (const refund of batch.data) {
      if (!refund.id || seen.has(refund.id)) throw new RefundReconciliationError('Refund pagination requires review')
      seen.add(refund.id)
      refunds.push(refund)
    }
    if (!batch.has_more) return refunds
    if (!batch.data.length) throw new RefundReconciliationError('Refund pagination is incomplete')
    cursor = batch.data[batch.data.length - 1].id
  }
  throw new RefundReconciliationError('Refund history exceeds the automatic reconciliation limit; contact operations')
}
