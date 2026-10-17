import { z } from 'zod'
import { packagePurchaseRequestSchema, packagePurchaseTermsSchema } from '@/lib/package-purchase-schema'

// Retry initial purchase requests unchanged, or resume an already owned purchase.
export const packageCheckoutRequest = z.union([
  packagePurchaseRequestSchema,
  z.object({ purchaseId: z.string().min(1).max(128) }).strict(),
])
export const packageCheckoutResponse = z.object({
  purchaseId: z.string().min(1).max(128),
  checkoutUrl: z.string().url().refine(value => {
    try {
      const url = new URL(value)
      return url.protocol === 'https:' && url.hostname === 'checkout.stripe.com' && !url.username && !url.password && !url.port
    } catch { return false }
  }),
}).strict()

export const packageReviewQuery = z.union([
  z.object({ packageId: z.string().min(1).max(128), requestId: z.string().uuid().optional() }).strict(),
  z.object({ purchaseId: z.string().min(1).max(128) }).strict(),
])
export const packageReviewResponse = z.object({
  buyerId: z.string().min(1), packageId: z.string().min(1), purchaseId: z.string().min(1).nullable(), catalogRevision: z.string().datetime(),
  terms: packagePurchaseTermsSchema, amountInCents: z.number().int().min(50).max(99999999),
  trainerName: z.string(), trainerSlug: z.string().min(1),
  status: z.enum(['PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED']).nullable(),
  hold: z.string().nullable(), canCheckout: z.boolean(), canBuyAgain: z.boolean(),
}).strict()
export const savedPackageCheckout = z.object({ request: packagePurchaseRequestSchema }).strict()
