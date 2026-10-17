import type { Payment, Prisma, RefundStatus } from '@prisma/client'
import { loadRefunds, RefundReconciliationError } from '@/lib/stripe-refund-history'

const statuses: Record<string, RefundStatus> = { pending: 'PENDING', requires_action: 'REQUIRES_ACTION', succeeded: 'SUCCEEDED', failed: 'FAILED', canceled: 'CANCELED' }
function objectId(value: string | { id: string } | null | undefined) { return typeof value === 'string' ? value : value?.id || null }

// Both callers hold booking/payment locks and verify destination receipts before reading refunds.
export async function reconcilePaymentRefundHistory(tx: Prisma.TransactionClient, payment: Payment,
  intentId: string, chargeId: string, hasRefunds: boolean, refundId?: string) {
  const current = await loadRefunds(chargeId)
  if (hasRefunds && !current.length) throw new RefundReconciliationError('Refund history is not available; retry reconciliation')
  if (refundId && !current.some(refund => refund.id === refundId)) throw new RefundReconciliationError('The triggering refund is missing from current Stripe history')
  const previous = await tx.paymentRefund.findMany({ where: { paymentId: payment.id } })
  if (previous.some(old => !current.some(refund => refund.id === old.id))) throw new RefundReconciliationError('Previously recorded refund is missing from Stripe history')
  const oldSucceeded = previous.filter(row => row.status === 'SUCCEEDED').reduce((total, row) => total + row.amountInCents, 0)
  const oldPending = previous.filter(row => ['PENDING', 'REQUIRES_ACTION'].includes(row.status)).reduce((total, row) => total + row.amountInCents, 0)
  const oldFailed = previous.filter(row => ['FAILED', 'CANCELED'].includes(row.status)).length
  if (oldSucceeded !== payment.refundAmountInCents || oldPending !== payment.refundPendingAmountInCents || oldFailed !== payment.refundFailedCount ||
      (payment.status === 'REFUNDED' && oldSucceeded !== payment.amountInCents) ||
      (payment.status === 'PARTIALLY_REFUNDED' && (oldSucceeded <= 0 || oldSucceeded >= payment.amountInCents))) {
    throw new RefundReconciliationError('Recorded refund state has no consistent ledger evidence')
  }
  let succeeded = 0, pending = 0, failed = 0
  const observedAt = new Date()
  const rows = current.map(refund => {
    const status = refund.status ? statuses[refund.status] : undefined
    if (typeof status !== 'string' || objectId(refund.charge) !== chargeId || objectId(refund.payment_intent) !== intentId || refund.currency !== 'usd' ||
        !Number.isSafeInteger(refund.amount) || refund.amount <= 0 || refund.amount > payment.amountInCents ||
        !Number.isSafeInteger(refund.created) || refund.created < 0 || !Number.isFinite(new Date(refund.created * 1000).getTime())) {
      throw new RefundReconciliationError('Stripe refund identity, amount or status requires review')
    }
    const old = previous.find(item => item.id === refund.id)
    if (old && (old.amountInCents !== refund.amount || old.stripeChargeId !== chargeId || old.stripePaymentIntentId !== intentId || old.currency !== refund.currency)) {
      throw new RefundReconciliationError('A refund changed immutable financial identity')
    }
    if (status === 'SUCCEEDED') succeeded += refund.amount
    else if (status === 'PENDING' || status === 'REQUIRES_ACTION') pending += refund.amount
    else failed++
    return { id: refund.id, paymentId: payment.id, stripeChargeId: chargeId, stripePaymentIntentId: intentId,
      amountInCents: refund.amount, currency: refund.currency, status,
      transferReversalId: objectId(refund.transfer_reversal), sourceTransferReversalId: objectId(refund.source_transfer_reversal),
      failureBalanceTransactionId: objectId(refund.failure_balance_transaction), failureReason: refund.failure_reason || null,
      stripeCreatedAt: new Date(refund.created * 1000), observedAt }
  })
  if (!Number.isSafeInteger(succeeded + pending) || succeeded + pending > payment.amountInCents) throw new RefundReconciliationError('Refund totals exceed the recorded payment')
  const status = succeeded === payment.amountInCents ? 'REFUNDED' as const : succeeded > 0 ? 'PARTIALLY_REFUNDED' as const : 'SUCCEEDED' as const
  for (const row of rows) {
    const saved = await tx.paymentRefund.upsert({ where: { id: row.id }, create: row, update: { ...row, paymentId: undefined } })
    if (saved.paymentId !== payment.id) throw new RefundReconciliationError('Refund is already linked to a different payment')
  }
  return { rows, previous, succeeded, pending, failed, status, observedAt }
}
