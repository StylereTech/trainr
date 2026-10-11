import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'
import { verifyDestinationCharge } from '@/lib/stripe-settlement'
import { PackagePurchaseError } from '@/lib/package-purchases'
import { assertPackageAttempt, assertPackageSession, packagePaymentIdentity, stripeObjectId } from '@/lib/package-checkout-identity'

// A paid redirect/event is only a prompt to read current provider receipts, never proof itself.
export async function reconcilePackageCheckout(purchaseId: string, attemptId: string, sessionId: string) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM package_purchases WHERE id = ${purchaseId} FOR UPDATE`
    const purchase = await tx.packagePurchase.findUnique({ where: { id: purchaseId } })
    const attempt = await tx.packageCheckoutAttempt.findFirst({ where: { purchaseId }, orderBy: { sequence: 'desc' } })
    if (!purchase || !attempt || attempt.id !== attemptId) throw new PackagePurchaseError('Package checkout attempt does not match the purchase.')
    assertPackageAttempt(purchase, attempt)
    const session = await stripe.checkout.sessions.retrieve(sessionId, {}, { timeout: 4000, maxNetworkRetries: 0 })
    if (session.id !== sessionId) throw new PackagePurchaseError('Package checkout session identity changed.')
    assertPackageSession(purchase, attempt, session)
    const intentId = stripeObjectId(session.payment_intent)
    if (session.status !== 'complete' || session.payment_status !== 'paid' || !intentId) throw new PackagePurchaseError('Package payment is not completed.')
    const settlement = await verifyDestinationCharge(purchase, attempt, packagePaymentIdentity(purchase.id, attempt.id),
      intentId, null, {}, session.livemode)
    await tx.packageCheckoutAttempt.update({ where: { id: attempt.id }, data: { stripeCheckoutSessionId: session.id } })
    return tx.packagePurchase.update({ where: { id: purchase.id }, data: {
      stripeCheckoutSessionId: session.id, stripePaymentIntentId: intentId, stripeChargeId: settlement.chargeId, stripeTransferId: settlement.transferId,
      status: ['REFUNDED', 'PARTIALLY_REFUNDED'].includes(purchase.status) ? purchase.status : 'SUCCEEDED',
      settlementVerifiedAt: new Date(), financialReview: settlement.review ? JSON.parse(JSON.stringify(settlement.review)) : Prisma.DbNull,
    } })
  }, { maxWait: 5000, timeout: 30000 })
}
