import type { PackagePurchase, Prisma, RefundStatus } from '@prisma/client'
import { loadRefunds, RefundReconciliationError } from '@/lib/stripe-refund-history'
import { stripeObjectId } from '@/lib/package-checkout-identity'

const statuses: Record<string, RefundStatus> = { pending: 'PENDING', requires_action: 'REQUIRES_ACTION', succeeded: 'SUCCEEDED', failed: 'FAILED', canceled: 'CANCELED' }

// The caller holds the purchase lock and has verified current destination-charge receipts.
export async function reconcilePackageRefundHistory(tx: Prisma.TransactionClient, purchase: PackagePurchase,
  intentId: string, chargeId: string, hasRefunds: boolean, refundId?: string) {
  const current = await loadRefunds(chargeId)
  if (hasRefunds && !current.length) throw new RefundReconciliationError('Package refund history is not available; retry reconciliation')
  if (refundId && !current.some(refund => refund.id === refundId)) throw new RefundReconciliationError('The triggering package refund is missing from current Stripe history')
  const previous = await tx.packageRefund.findMany({ where: { purchaseId: purchase.id } })
  if (previous.some(old => !current.some(refund => refund.id === old.id))) throw new RefundReconciliationError('Previously recorded package refund is missing from Stripe history')
  const previousSucceeded = previous.filter(refund => refund.status === 'SUCCEEDED').reduce((total, refund) => total + refund.amountInCents, 0)
  const previousPending = previous.filter(refund => ['PENDING', 'REQUIRES_ACTION'].includes(refund.status)).reduce((total, refund) => total + refund.amountInCents, 0)
  const previousFailed = previous.filter(refund => ['FAILED', 'CANCELED'].includes(refund.status)).length
  if (previousSucceeded !== purchase.refundAmountInCents || previousPending !== purchase.refundPendingAmountInCents || previousFailed !== purchase.refundFailedCount ||
      (purchase.status === 'REFUNDED' && previousSucceeded !== purchase.amountInCents) ||
      (purchase.status === 'PARTIALLY_REFUNDED' && (previousSucceeded <= 0 || previousSucceeded >= purchase.amountInCents))) {
    throw new RefundReconciliationError('Recorded package refund state has no consistent ledger evidence')
  }
  let succeeded = 0, pending = 0, failed = 0
  const observedAt = new Date()
  const rows = current.map(refund => {
    const status = refund.status ? statuses[refund.status] : undefined
    if (typeof status !== 'string' || stripeObjectId(refund.charge) !== chargeId || stripeObjectId(refund.payment_intent) !== intentId || refund.currency !== 'usd' ||
        !Number.isSafeInteger(refund.amount) || refund.amount <= 0 || refund.amount > purchase.amountInCents ||
        !Number.isSafeInteger(refund.created) || refund.created < 0 || !Number.isFinite(new Date(refund.created * 1000).getTime())) {
      throw new RefundReconciliationError('Package refund identity, amount or status requires review')
    }
    const old = previous.find(item => item.id === refund.id)
    if (old && (old.amountInCents !== refund.amount || old.stripeChargeId !== chargeId || old.stripePaymentIntentId !== intentId ||
        old.currency !== refund.currency || old.stripeCreatedAt.getTime() !== refund.created * 1000)) {
      throw new RefundReconciliationError('A package refund changed immutable financial identity')
    }
    // Stripe can return a previously successful refund to failed or requires_action.
    if (status === 'SUCCEEDED') succeeded += refund.amount
    else if (status === 'PENDING' || status === 'REQUIRES_ACTION') pending += refund.amount
    else failed++
    return { id: refund.id, purchaseId: purchase.id, stripeChargeId: chargeId, stripePaymentIntentId: intentId,
      amountInCents: refund.amount, currency: refund.currency, status,
      transferReversalId: stripeObjectId(refund.transfer_reversal), sourceTransferReversalId: stripeObjectId(refund.source_transfer_reversal),
      failureBalanceTransactionId: stripeObjectId(refund.failure_balance_transaction), failureReason: refund.failure_reason || null,
      stripeCreatedAt: new Date(refund.created * 1000), observedAt }
  })
  if (!Number.isSafeInteger(succeeded + pending) || succeeded + pending > purchase.amountInCents) throw new RefundReconciliationError('Package refund totals exceed the recorded payment')
  if (rows.length && await tx.paymentRefund.findFirst({ where: { id: { in: rows.map(row => row.id) } }, select: { id: true } })) {
    throw new RefundReconciliationError('Package refund is already linked to a booking payment')
  }
  const linked = await tx.packageRefund.findMany({ where: { id: { in: rows.map(row => row.id) } }, select: { purchaseId: true } })
  if (linked.some(row => row.purchaseId !== purchase.id)) throw new RefundReconciliationError('Refund is already linked to another package purchase')
  for (const row of rows) {
    const saved = await tx.packageRefund.upsert({ where: { id: row.id }, create: row, update: row })
    if (saved.purchaseId !== purchase.id) throw new RefundReconciliationError('Refund is already linked to another package purchase')
  }
  return { status: succeeded === purchase.amountInCents ? 'REFUNDED' as const : succeeded > 0 ? 'PARTIALLY_REFUNDED' as const : 'SUCCEEDED' as const,
    refundAmountInCents: succeeded, refundPendingAmountInCents: pending, refundFailedCount: failed, refundsVerifiedAt: observedAt }
}
