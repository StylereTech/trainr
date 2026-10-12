import type { Prisma, PackagePurchase } from '@prisma/client'
import { packagePurchaseTermsSchema } from '@/lib/package-purchase-schema'
import { PackagePurchaseError } from '@/lib/package-purchases'

// Caller holds the purchase lock and has just verified current Stripe receipts.
export async function recordPackageCreditGrants(tx: Prisma.TransactionClient, purchase: PackagePurchase) {
  if (purchase.status !== 'SUCCEEDED' || !purchase.settlementVerifiedAt || !purchase.stripePaymentIntentId ||
      !purchase.stripeChargeId || !purchase.stripeTransferId || purchase.financialReview || purchase.refundAmountInCents ||
      purchase.refundPendingAmountInCents || purchase.refundFailedCount) return
  const terms = packagePurchaseTermsSchema.parse(purchase.terms)
  const existing = await tx.packageCreditGrant.findMany({ where: { purchaseId: purchase.id } })
  if (existing.some(grant => !terms.items.some(item => item.serviceOfferingId === grant.serviceOfferingId && item.sessionsCount === grant.sessionsCount))) {
    throw new PackagePurchaseError('Recorded package credits require reconciliation.')
  }
  await tx.packageCreditGrant.createMany({ data: terms.items.filter(item => !existing.some(grant => grant.serviceOfferingId === item.serviceOfferingId))
    .map(item => ({ purchaseId: purchase.id, serviceOfferingId: item.serviceOfferingId, sessionsCount: item.sessionsCount })) })
}
