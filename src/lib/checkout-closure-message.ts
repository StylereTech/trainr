export function checkoutClosureMessage(result: unknown) {
  if (result === 'closed') return 'Checkout is closed. No refund was issued by this action.'
  if (result === 'not_required') return 'No checkout required closure. This is not a refund receipt.'
  return 'Booking cancelled. Payment or checkout closure needs support review. No refund was issued by this action.'
}
