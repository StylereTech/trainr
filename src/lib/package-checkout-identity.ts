import type { PackageCheckoutAttempt, PackagePurchase } from '@prisma/client'
import type Stripe from 'stripe'
import { z } from 'zod'
import { PackagePurchaseError } from '@/lib/package-purchases'

export const packagePaymentIdentity = (purchaseId: string, attemptId: string) => ({
  paymentKind: 'package', packagePurchaseId: purchaseId, packageCheckoutAttemptId: attemptId,
})
export const stripeObjectId = (value: string | { id: string } | null | undefined) => typeof value === 'string' ? value : value?.id || null

const identitySchema = z.object({ paymentKind: z.literal('package'), packagePurchaseId: z.string().min(1), packageCheckoutAttemptId: z.string().min(1) }).strict()
const parameterSchema = z.object({
  mode: z.literal('payment'), payment_method_types: z.tuple([z.literal('card')]),
  metadata: identitySchema, expires_at: z.number().int().positive(),
  line_items: z.array(z.object({ quantity: z.literal(1), price_data: z.object({ currency: z.literal('usd'), unit_amount: z.number().int().positive() }) })).length(1),
  payment_intent_data: z.object({ application_fee_amount: z.number().int().nonnegative(),
    transfer_data: z.object({ destination: z.string().startsWith('acct_'), amount: z.undefined() }), metadata: identitySchema }),
})

export function assertPackageAttempt(purchase: PackagePurchase, attempt: PackageCheckoutAttempt, accountId?: string) {
  const parsed = parameterSchema.safeParse(attempt.parameters)
  if (!parsed.success || attempt.purchaseId !== purchase.id || attempt.retiredAt) throw new PackagePurchaseError('Saved package checkout requires reconciliation.')
  const saved = parsed.data, identity = packagePaymentIdentity(purchase.id, attempt.id)
  if (!Object.entries(identity).every(([key, value]) => saved.metadata[key as keyof typeof identity] === value && saved.payment_intent_data.metadata[key as keyof typeof identity] === value) ||
      saved.line_items[0].price_data.unit_amount !== purchase.amountInCents || saved.payment_intent_data.application_fee_amount !== purchase.platformFeeInCents ||
      (accountId && saved.payment_intent_data.transfer_data.destination !== accountId)) {
    throw new PackagePurchaseError('Package checkout amounts or destination require reconciliation.')
  }
  return saved
}

export function assertPackageSession(purchase: PackagePurchase, attempt: PackageCheckoutAttempt, session: Stripe.Checkout.Session) {
  const identity = packagePaymentIdentity(purchase.id, attempt.id)
  if (!session.id || session.mode !== 'payment' || session.currency !== 'usd' || session.amount_total !== purchase.amountInCents ||
      typeof session.livemode !== 'boolean' || session.recovered_from || session.after_expiration?.recovery?.enabled || session.metadata?.bookingId || session.metadata?.paymentId ||
      !Object.entries(identity).every(([key, value]) => session.metadata?.[key] === value) ||
      (attempt.stripeCheckoutSessionId && attempt.stripeCheckoutSessionId !== session.id) ||
      (purchase.stripeCheckoutSessionId && purchase.stripeCheckoutSessionId !== session.id) ||
      (purchase.stripePaymentIntentId && purchase.stripePaymentIntentId !== stripeObjectId(session.payment_intent))) {
    throw new PackagePurchaseError('Stripe package checkout identity requires reconciliation.')
  }
}
