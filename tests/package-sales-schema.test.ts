import { describe, expect, it } from 'vitest'
import { packageCheckoutRequest, packageCheckoutResponse } from '@/lib/package-sales-schema'

const purchase = { requestId: '750a6168-89ec-4e57-bdd7-c34806b80c50', packageId: 'package', catalogRevision: '2026-10-13T00:00:00.000Z', expectedTotalInCents: 6000 }
describe('package sales contracts', () => {
  it('accepts a reviewed purchase and an existing purchase resume without mixing them', () => {
    expect(packageCheckoutRequest.parse(purchase)).toEqual(purchase)
    expect(packageCheckoutRequest.parse({ purchaseId: 'owned' })).toEqual({ purchaseId: 'owned' })
    expect(packageCheckoutRequest.safeParse({ ...purchase, purchaseId: 'owned' }).success).toBe(false)
  })
  it.each([{}, { purchaseId: '' }, { purchaseId: 'owned', parentId: 'other' }, { ...purchase, expectedTotalInCents: 0 },
    { ...purchase, requestId: 'invalid' }, { ...purchase, currency: 'eur' }])('rejects invalid or extra input %j', input => {
    expect(packageCheckoutRequest.safeParse(input).success).toBe(false)
  })
  it('accepts only the safe checkout projection', () => {
    const result = { purchaseId: 'owned', checkoutUrl: 'https://checkout.stripe.com/c/pay/session' }
    expect(packageCheckoutResponse.parse(result)).toEqual(result)
    expect(packageCheckoutResponse.safeParse({ ...result, stripeAccountId: 'private' }).success).toBe(false)
  })
  it.each(['http://checkout.stripe.com/pay', 'https://checkout.stripe.com.evil.test/pay', 'https://user@checkout.stripe.com/pay',
    'https://checkout.stripe.com:8443/pay', 'javascript:alert(1)', '/pay'])('rejects unsafe checkout address %s', checkoutUrl => {
    expect(packageCheckoutResponse.safeParse({ purchaseId: 'owned', checkoutUrl }).success).toBe(false)
  })
})
