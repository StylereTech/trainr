import { z } from 'zod'
import { packagePurchaseRequestSchema } from '@/lib/package-purchase-schema'

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
