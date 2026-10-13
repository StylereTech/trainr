import type { Prisma } from '@prisma/client'
import { BookingCreationError } from '@/lib/booking-slot'
import { packagePurchaseTermsSchema, type PackagePurchaseTerms } from '@/lib/package-purchase-schema'

export const creditPurchaseInclude = { paymentReceipt: true,
  creditGrants: { include: { _count: { select: { redemptions: { where: { restoredAt: null } } } } } },
} satisfies Prisma.PackagePurchaseInclude

export function requireCreditPayment(purchase: Prisma.PackagePurchaseGetPayload<{ include: typeof creditPurchaseInclude }>, reviewHeld: boolean) {
  const terms = packagePurchaseTermsSchema.safeParse(purchase.terms), receipt = purchase.paymentReceipt
  if (!terms.success || terms.data.version !== 2 || purchase.status !== 'SUCCEEDED' || !purchase.settlementVerifiedAt ||
      reviewHeld || purchase.financialReview !== null || purchase.refundAmountInCents || purchase.refundPendingAmountInCents || purchase.refundFailedCount ||
      !purchase.stripeTransferId || !purchase.stripePaymentIntentId || !purchase.stripeChargeId || !purchase.stripeCheckoutSessionId ||
      !receipt || receipt.stripePaymentIntentId !== purchase.stripePaymentIntentId || receipt.stripeChargeId !== purchase.stripeChargeId ||
      receipt.stripeCheckoutSessionId !== purchase.stripeCheckoutSessionId) {
    throw new BookingCreationError('Package payment needs reconciliation before booking. Contact support.', 409)
  }
  return { terms: terms.data, receipt }
}

export const creditServiceInclude = { sport: true, trainerProfile: { include: { sports: true, user: { select: { role: true, deletedAt: true } } } } } satisfies Prisma.ServiceOfferingInclude
export function creditServiceAvailable(service: Prisma.ServiceOfferingGetPayload<{ include: typeof creditServiceInclude }> | null | undefined,
  trainerId: string, item: PackagePurchaseTerms['items'][number]) {
  return !!service && service.trainerProfileId === trainerId && service.isActive && service.trainerProfile.isActive &&
    service.trainerProfile.approvalStatus === 'APPROVED' && service.trainerProfile.user.role === 'TRAINER' && !service.trainerProfile.user.deletedAt &&
    !!service.sport?.isActive && service.trainerProfile.sports.some(sport => sport.sportId === item.sportId) &&
    service.sportId === item.sportId && service.type === item.type && service.durationMinutes === item.durationMinutes &&
    Number.isInteger(service.maxParticipants) && service.maxParticipants >= 1
}
