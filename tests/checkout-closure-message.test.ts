import { expect, it } from 'vitest'
import { checkoutClosureMessage } from '@/lib/checkout-closure-message'

it('distinguishes closure and absence from payment or refund settlement', () => {
  expect(checkoutClosureMessage('closed')).toBe('Checkout is closed. No refund was issued by this action.')
  expect(checkoutClosureMessage('not_required')).toBe('No checkout required closure. This is not a refund receipt.')
})
it.each([undefined, null, 'review_required', 'paid', {}, true])('never promotes unknown closure %j to success', result => {
  expect(checkoutClosureMessage(result)).toContain('needs support review')
  expect(checkoutClosureMessage(result)).toContain('No refund was issued')
})
