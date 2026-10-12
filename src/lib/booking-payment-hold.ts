export type BookingPaymentState = {
  status: string
  refundAmountInCents: number
  refundPendingAmountInCents?: number
  refundFailedCount?: number
  settlementVerifiedAt?: string | Date | null
  financialReview?: unknown
}

export function bookingPaymentHold(booking: { totalAmountInCents: number; payment: BookingPaymentState | null }) {
  const payment = booking.payment
  if (payment?.financialReview || payment?.refundAmountInCents || payment?.refundPendingAmountInCents || payment?.refundFailedCount) {
    return 'Payment needs reconciliation before this session can be confirmed or completed.'
  }
  if (!payment || payment.status !== 'SUCCEEDED') return 'Verified, fully settled payment is required before confirming or completing this session.'
  const verifiedAt = payment.settlementVerifiedAt instanceof Date ? payment.settlementVerifiedAt.getTime()
    : typeof payment.settlementVerifiedAt === 'string' ? Date.parse(payment.settlementVerifiedAt) : NaN
  if (booking.totalAmountInCents > 0 && !Number.isFinite(verifiedAt)) {
    return 'Payment verification is required. Contact support to reconcile the saved Stripe receipt.'
  }
  return null
}
