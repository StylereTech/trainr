import { Prisma } from '@prisma/client'
import { createHash } from 'node:crypto'
import type Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'
import { SettlementConflict, verifyDestinationCharge, type SettlementSource } from '@/lib/stripe-settlement'
import { PackagePurchaseError } from '@/lib/package-purchases'
import { assertPackageAttempt, assertPackageSession, packagePaymentIdentity, stripeObjectId } from '@/lib/package-checkout-identity'
import { reconcilePackageRefundHistory } from '@/lib/package-refunds'

// A paid redirect/event is only a prompt to read current provider receipts, never proof itself.
export async function reconcilePackageCheckout(purchaseId: string, attemptId: string, sessionId: string,
  evidence: { intentId: string; chargeId: string; source: SettlementSource; refunds?: { refundId?: string } } | undefined = undefined) {
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
    if (evidence && evidence.intentId !== intentId) throw new PackagePurchaseError('Package financial event intent does not match checkout.')
    const settlement = await verifyDestinationCharge(purchase, attempt, packagePaymentIdentity(purchase.id, attempt.id),
      intentId, evidence?.chargeId, evidence?.source, session.livemode)
    const refunds = evidence?.refunds ? await reconcilePackageRefundHistory(tx, purchase, intentId, settlement.chargeId, settlement.hasRefunds, evidence.refunds.refundId) : null
    const refundState = refunds || purchase
    // A normal paid/transfer replay must not clear unresolved refund evidence.
    const details = { ...settlement.review?.details, packageRefunds: { refundedInCents: refundState.refundAmountInCents,
      pendingInCents: refundState.refundPendingAmountInCents, failedCount: refundState.refundFailedCount } }
    const review = refundState.refundAmountInCents || refundState.refundPendingAmountInCents || refundState.refundFailedCount
      ? { key: createHash('sha256').update(JSON.stringify(details)).digest('hex'), details } : settlement.review
    await tx.packageCheckoutAttempt.update({ where: { id: attempt.id }, data: { stripeCheckoutSessionId: session.id } })
    return tx.packagePurchase.update({ where: { id: purchase.id }, data: {
      stripeCheckoutSessionId: session.id, stripePaymentIntentId: intentId, stripeChargeId: settlement.chargeId, stripeTransferId: settlement.transferId,
      status: ['REFUNDED', 'PARTIALLY_REFUNDED'].includes(purchase.status) ? purchase.status : 'SUCCEEDED',
      settlementVerifiedAt: new Date(), financialReview: review ? JSON.parse(JSON.stringify(review)) : Prisma.DbNull,
      ...(refunds || {}),
    } })
  }, { maxWait: 5000, timeout: evidence?.refunds ? 45000 : 30000 })
}

export async function reconcilePackageCharge(charge: Stripe.Charge, source: SettlementSource, hasBookingMatches: boolean, refunds?: { refundId?: string }) {
  const chargeId = charge.id, intentId = stripeObjectId(charge.payment_intent)
  const matches = await prisma.packagePurchase.findMany({ where: { OR: [
    { stripeChargeId: chargeId }, ...(intentId ? [{ stripePaymentIntentId: intentId }] : []),
    ...(source.transferId ? [{ stripeTransferId: source.transferId }] : []),
    ...(charge.metadata?.packagePurchaseId ? [{ id: charge.metadata.packagePurchaseId }] : []),
  ] }, select: { id: true }, take: 2 })
  const packageMetadata = charge.metadata?.paymentKind === 'package' || charge.metadata?.packagePurchaseId || charge.metadata?.packageCheckoutAttemptId
  if (!matches.length && !packageMetadata) return false
  if (hasBookingMatches || matches.length !== 1 || !intentId || charge.metadata?.paymentKind !== 'package' ||
      charge.metadata.packagePurchaseId !== matches[0].id || !charge.metadata.packageCheckoutAttemptId ||
      charge.metadata.bookingId || charge.metadata.paymentId || charge.metadata.checkoutAttemptId) {
    throw new SettlementConflict('Package financial event does not map to one unambiguous purchase')
  }
  const attempt = await prisma.packageCheckoutAttempt.findUnique({ where: { id: charge.metadata.packageCheckoutAttemptId } })
  if (!attempt || attempt.purchaseId !== matches[0].id || attempt.retiredAt) throw new SettlementConflict('Package financial event checkout attempt does not match')
  // Provider events can precede local attachment; retry rather than losing the event.
  if (!attempt.stripeCheckoutSessionId) throw new Error('Package checkout session is not attached yet; retry required')
  await reconcilePackageCheckout(matches[0].id, attempt.id, attempt.stripeCheckoutSessionId, { intentId, chargeId, source, refunds })
  return true
}
