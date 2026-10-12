import type { PackagePurchase, Prisma } from '@prisma/client'
import { z } from 'zod'
import { PackagePurchaseError } from '@/lib/package-purchases'

const providerId = (prefix: string) => z.string().regex(new RegExp(`^${prefix}_[A-Za-z0-9_]{1,250}$`))
export const packageSuccessEvidenceSchema = z.object({
  eventId: providerId('evt'), created: z.number().int().safe().min(946684800), livemode: z.boolean(),
  intentId: providerId('pi'), chargeId: providerId('ch'),
  amountInCents: z.number().int().safe().positive(), currency: z.literal('usd'),
}).strict()
export type PackageSuccessEvidence = z.infer<typeof packageSuccessEvidenceSchema>

// Only called after signed success-event handling and independent current receipt verification.
// Caller holds the purchase lock; a replay never resets the package validity clock.
export async function recordPackagePaymentReceipt(tx: Prisma.TransactionClient, purchase: PackagePurchase,
  raw: PackageSuccessEvidence, sessionLivemode: boolean) {
  const parsed = packageSuccessEvidenceSchema.safeParse(raw)
  if (!parsed.success) throw new PackagePurchaseError('Package payment success evidence is invalid.')
  const evidence = parsed.data
  const paidAt = new Date(evidence.created * 1000)
  if (!Number.isFinite(paidAt.getTime()) || evidence.livemode !== sessionLivemode || evidence.intentId !== purchase.stripePaymentIntentId ||
      evidence.chargeId !== purchase.stripeChargeId || evidence.amountInCents !== purchase.amountInCents ||
      !purchase.settlementVerifiedAt || !purchase.stripeCheckoutSessionId || !purchase.stripeTransferId ||
      evidence.created < Math.floor(purchase.createdAt.getTime() / 1000) || paidAt.getTime() > Date.now() + 300000) {
    throw new PackagePurchaseError('Package payment success evidence does not match the verified purchase.')
  }
  const existing = await tx.packagePaymentReceipt.findUnique({ where: { purchaseId: purchase.id } })
  if (existing) {
    if (existing.paidAt.getTime() !== paidAt.getTime() || existing.livemode !== evidence.livemode ||
        existing.stripePaymentIntentId !== evidence.intentId || existing.stripeChargeId !== evidence.chargeId ||
        existing.stripeCheckoutSessionId !== purchase.stripeCheckoutSessionId) {
      throw new PackagePurchaseError('Package payment success evidence conflicts with the saved receipt.')
    }
    return existing
  }
  return tx.packagePaymentReceipt.create({ data: {
    purchaseId: purchase.id, stripeEventId: evidence.eventId, stripePaymentIntentId: evidence.intentId,
    stripeChargeId: evidence.chargeId, stripeCheckoutSessionId: purchase.stripeCheckoutSessionId,
    livemode: evidence.livemode, paidAt,
  } })
}
