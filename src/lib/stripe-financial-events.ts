import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'
import { applyPaymentEvidence } from '@/lib/stripe-payment-events'
import { SettlementConflict, type SettlementSource } from '@/lib/stripe-settlement'
import { reconcilePackageCheckout } from '@/lib/package-settlement'

const requestOptions = { timeout: 4000, maxNetworkRetries: 0 }
function objectId(value: string | { id: string } | null | undefined) { return typeof value === 'string' ? value : value?.id || null }

export async function reconcileFinancialEvent(event: { kind: 'transfer' | 'fee' | 'charge'; id: string; disputeId?: string }) {
  if (!event.id || typeof event.id !== 'string') throw new SettlementConflict('Financial event identity is missing')
  let chargeId: string | null = event.id
  const source: SettlementSource = event.disputeId ? { disputeId: event.disputeId } : {}
  if (event.kind === 'transfer') {
    const transfer = await stripe.transfers.retrieve(event.id, {}, requestOptions)
    if (transfer.id !== event.id) throw new SettlementConflict('Stripe transfer identity requires reconciliation')
    source.transferId = transfer.id
    chargeId = objectId(transfer.source_transaction)
    if (!chargeId) {
      const linked = await prisma.payment.findFirst({ where: { stripeTransferId: transfer.id }, select: { id: true } })
      const packageLinked = await prisma.packagePurchase.findFirst({ where: { stripeTransferId: transfer.id }, select: { id: true } })
      if (linked || packageLinked) throw new SettlementConflict('Recorded transfer has no source charge')
      return { ignored: true }
    }
  } else if (event.kind === 'fee') {
    const fee = await stripe.applicationFees.retrieve(event.id, {}, requestOptions)
    if (fee.id !== event.id) throw new SettlementConflict('Stripe application fee identity requires reconciliation')
    source.feeId = fee.id
    chargeId = objectId(fee.originating_transaction)
    if (!chargeId) return { ignored: true }
  }
  // Resolve by current provider relationships, never by transfer/fee webhook metadata or stale amounts.
  const charge = await stripe.charges.retrieve(chargeId, {}, requestOptions)
  if (charge.id !== chargeId) throw new SettlementConflict('Stripe source charge identity requires reconciliation')
  const intentId = objectId(charge.payment_intent)
  const matches = await prisma.payment.findMany({ where: { OR: [
    { stripeChargeId: chargeId }, ...(intentId ? [{ stripePaymentIntentId: intentId }] : []),
    ...(source.transferId ? [{ stripeTransferId: source.transferId }] : []),
    ...(charge.metadata?.bookingId && charge.metadata?.paymentId ? [{ id: charge.metadata.paymentId, bookingId: charge.metadata.bookingId }] : []),
  ] }, select: { id: true, bookingId: true }, take: 2 })
  const packageMatches = await prisma.packagePurchase.findMany({ where: { OR: [
    { stripeChargeId: chargeId }, ...(intentId ? [{ stripePaymentIntentId: intentId }] : []),
    ...(source.transferId ? [{ stripeTransferId: source.transferId }] : []),
    ...(charge.metadata?.packagePurchaseId ? [{ id: charge.metadata.packagePurchaseId }] : []),
  ] }, select: { id: true }, take: 2 })
  const packageMetadata = charge.metadata?.paymentKind === 'package' || charge.metadata?.packagePurchaseId || charge.metadata?.packageCheckoutAttemptId
  if (packageMatches.length || packageMetadata) {
    if (matches.length || packageMatches.length !== 1 || !intentId || charge.metadata?.paymentKind !== 'package' ||
        charge.metadata.packagePurchaseId !== packageMatches[0].id || !charge.metadata.packageCheckoutAttemptId ||
        charge.metadata.bookingId || charge.metadata.paymentId || charge.metadata.checkoutAttemptId) {
      throw new SettlementConflict('Package financial event does not map to one unambiguous purchase')
    }
    const attempt = await prisma.packageCheckoutAttempt.findUnique({ where: { id: charge.metadata.packageCheckoutAttemptId } })
    if (!attempt || attempt.purchaseId !== packageMatches[0].id || attempt.retiredAt) {
      throw new SettlementConflict('Package financial event checkout attempt does not match')
    }
    // Provider events can precede local session attachment. Retry instead of acknowledging lost reconciliation.
    if (!attempt.stripeCheckoutSessionId) throw new Error('Package checkout session is not attached yet; retry required')
    await reconcilePackageCheckout(packageMatches[0].id, attempt.id, attempt.stripeCheckoutSessionId, { intentId, chargeId, source })
    return { ignored: false }
  }
  if (!matches.length) {
    if (charge.metadata?.bookingId || charge.metadata?.paymentId) throw new SettlementConflict('TRAINR financial event is not linked yet; reconciliation required')
    return { ignored: true }
  }
  if (matches.length !== 1 || !intentId) throw new SettlementConflict('Financial event does not map to one booking payment')
  await applyPaymentEvidence({ bookingId: matches[0].bookingId, paymentId: matches[0].id,
    attemptId: charge.metadata?.checkoutAttemptId, intentId, chargeId, amount: charge.amount, currency: charge.currency, outcome: 'paid' }, source)
  return { ignored: false }
}
