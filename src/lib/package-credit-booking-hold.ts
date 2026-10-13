import type { Prisma } from '@prisma/client'
import { packagePurchaseTermsSchema } from '@/lib/package-purchase-schema'

export const creditBookingInclude = {
  creditRedemption: { include: { grant: { include: { purchase: { include: { paymentReceipt: true } } } } } },
} satisfies Prisma.BookingInclude

type CreditBooking = Prisma.BookingGetPayload<{ include: typeof creditBookingInclude }>

// A previously reserved session keeps its funding after expiry, but never after a
// refund/review hold. Read this under the purchase lock, not from a cached DTO.
export function packageCreditBookingHold(booking: CreditBooking & { payment: unknown }) {
  const credit = booking.creditRedemption
  if (!credit) return 'Package credit funding is missing. Contact support.'
  const purchase = credit.grant.purchase, receipt = purchase.paymentReceipt
  const terms = packagePurchaseTermsSchema.safeParse(purchase.terms)
  const item = terms.success ? terms.data.items.find(item => item.serviceOfferingId === booking.serviceOfferingId) : null
  const paidAt = receipt?.paidAt.getTime() ?? NaN
  const redeemedAt = credit.redeemedAt.getTime(), startsAt = booking.startsAt?.getTime() ?? NaN
  const expiresAt = paidAt + (terms.success ? terms.data.validForDays : NaN) * 86400000
  if (credit.restoredAt || booking.payment || credit.bookingId !== booking.id ||
      credit.serviceOfferingId !== booking.serviceOfferingId || credit.purchaseId !== purchase.id ||
      purchase.parentProfileId !== booking.parentProfileId || purchase.trainerProfileId !== booking.trainerProfileId ||
      booking.totalAmountInCents !== 0 || booking.platformFeeInCents !== 0 || booking.trainerPayoutInCents !== 0 ||
      booking.packageId || booking.packageSessionNumber !== null ||
      !terms.success || terms.data.version !== 2 || !item || item.sessionsCount !== credit.grant.sessionsCount ||
      !Number.isFinite(paidAt) || !Number.isFinite(redeemedAt) || !Number.isFinite(startsAt) ||
      paidAt > redeemedAt || redeemedAt >= expiresAt || startsAt <= redeemedAt || startsAt >= expiresAt ||
      !booking.endsAt || booking.endsAt.getTime() - startsAt !== item.durationMinutes * 60000) {
    return 'Package credit funding needs reconciliation before recording this session outcome.'
  }
  if (purchase.status !== 'SUCCEEDED' || !purchase.settlementVerifiedAt || purchase.financialReview ||
      purchase.refundAmountInCents !== 0 || purchase.refundPendingAmountInCents !== 0 || purchase.refundFailedCount !== 0 ||
      !purchase.stripePaymentIntentId || !purchase.stripeChargeId || !purchase.stripeCheckoutSessionId || !purchase.stripeTransferId ||
      receipt?.stripePaymentIntentId !== purchase.stripePaymentIntentId || receipt.stripeChargeId !== purchase.stripeChargeId ||
      receipt.stripeCheckoutSessionId !== purchase.stripeCheckoutSessionId) {
    return 'Package payment needs reconciliation before recording this session outcome.'
  }
  return null
}
