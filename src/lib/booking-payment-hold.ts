export type BookingPaymentState = {
  status: string
  refundAmountInCents: number
  refundPendingAmountInCents?: number
  refundFailedCount?: number
  settlementVerifiedAt?: string | Date | null
  financialReview?: unknown
}

export type PackageCreditFunding = {
  kind: 'PACKAGE_CREDIT'
  purchaseId: string
  packageTitle: string
  restoredAt: string | null
  hold: string | null
}

export type BookingFundingState = { totalAmountInCents: number; payment: BookingPaymentState | null; creditFunding?: PackageCreditFunding | null }

export function bookingPaymentHold(booking: BookingFundingState) {
  // Display-only projection. Mutations verify the locked purchase/receipt, never this DTO.
  if (booking.creditFunding) {
    if (booking.payment || booking.totalAmountInCents !== 0) return 'Session funding needs reconciliation. Contact support.'
    if (booking.creditFunding.restoredAt) return 'This session credit has been returned to its package.'
    return booking.creditFunding.hold
  }
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
