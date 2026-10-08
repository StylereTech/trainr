import type Stripe from 'stripe'
import type { RefundStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'

export class RefundReconciliationError extends Error {
  constructor(message: string, public readonly status = 409) { super(message) }
}
const requestOptions = { timeout: 4000, maxNetworkRetries: 0 }
const statuses: Record<string, RefundStatus> = { pending: 'PENDING', requires_action: 'REQUIRES_ACTION', succeeded: 'SUCCEEDED', failed: 'FAILED', canceled: 'CANCELED' }
function objectId(value: string | { id: string } | null | undefined) { return typeof value === 'string' ? value : value?.id || null }

async function loadRefunds(chargeId: string) {
  const refunds: Stripe.Refund[] = []
  let cursor: string | undefined
  const seen = new Set<string>()
  for (let page = 0; page < 10; page++) {
    const batch = await stripe.refunds.list({ charge: chargeId, limit: 100, ...(cursor ? { starting_after: cursor } : {}) }, requestOptions)
    for (const refund of batch.data) {
      if (!refund.id || seen.has(refund.id)) throw new RefundReconciliationError('Refund pagination requires review')
      seen.add(refund.id)
      refunds.push(refund)
    }
    if (!batch.has_more) return refunds
    if (!batch.data.length) throw new RefundReconciliationError('Refund pagination is incomplete')
    cursor = batch.data[batch.data.length - 1].id
  }
  throw new RefundReconciliationError('Refund history exceeds the automatic reconciliation limit; contact operations')
}

export async function reconcilePaymentRefunds(bookingId: string, options: { adminUserId?: string; chargeId?: string; refundId?: string } = {}) {
  return prisma.$transaction(async tx => {
    if (options.adminUserId) {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${options.adminUserId} FOR SHARE`
      const actor = await tx.user.findUnique({ where: { id: options.adminUserId }, select: { role: true, deletedAt: true } })
      if (actor?.role !== 'ADMIN' || actor.deletedAt) throw new RefundReconciliationError('Administrator access is required', 403)
    }
    // Serialize the provider read with settlement/reconciliation so an older HTTP response cannot overwrite a newer observation.
    await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${bookingId} FOR UPDATE`
    await tx.$queryRaw`SELECT id FROM payments WHERE "bookingId" = ${bookingId} FOR UPDATE`
    const booking = await tx.booking.findUnique({ where: { id: bookingId }, include: { payment: true, parentProfile: true, trainerProfile: true } })
    const payment = booking?.payment
    if (!booking || !payment) throw new RefundReconciliationError('Booking payment not found', 404)
    if (!Number.isSafeInteger(payment.amountInCents) || payment.amountInCents <= 0) throw new RefundReconciliationError('No positive Stripe payment is recorded')
    if (!payment.stripePaymentIntentId) throw new RefundReconciliationError('Payment identity must be reconciled before refunds')
    let chargeId = options.chargeId || payment.stripeChargeId
    if (!chargeId) {
      const intent = await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId, {}, requestOptions)
      if (intent.id !== payment.stripePaymentIntentId || intent.status !== 'succeeded' || intent.amount_received !== payment.amountInCents || intent.currency !== 'usd') {
        throw new RefundReconciliationError('Stripe payment identity or settlement requires review')
      }
      chargeId = objectId(intent.latest_charge)
    }
    if (!chargeId || (payment.stripeChargeId && payment.stripeChargeId !== chargeId)) throw new RefundReconciliationError('Stripe charge identity requires review')
    const charge = await stripe.charges.retrieve(chargeId, {}, requestOptions)
    if (charge.id !== chargeId || objectId(charge.payment_intent) !== payment.stripePaymentIntentId || !charge.paid || !charge.captured ||
        charge.currency !== 'usd' || charge.amount !== payment.amountInCents || payment.amountInCents !== booking.totalAmountInCents ||
        (charge.metadata?.bookingId && charge.metadata.bookingId !== booking.id) || (charge.metadata?.paymentId && charge.metadata.paymentId !== payment.id)) {
      throw new RefundReconciliationError('Stripe charge does not match the recorded booking payment')
    }
    const providerRefunds = await loadRefunds(chargeId)
    if (options.refundId && !providerRefunds.some(refund => refund.id === options.refundId)) throw new RefundReconciliationError('The triggering refund is missing from current Stripe history')
    const previous = await tx.paymentRefund.findMany({ where: { paymentId: payment.id } })
    if (previous.some(refund => !providerRefunds.some(current => current.id === refund.id))) throw new RefundReconciliationError('Previously recorded refund is missing from Stripe history')
    let succeeded = 0
    let pending = 0
    let failed = 0
    const observedAt = new Date()
    const rows = providerRefunds.map(refund => {
      const status = refund.status ? statuses[refund.status] : undefined
      if (typeof status !== 'string' || objectId(refund.charge) !== chargeId || objectId(refund.payment_intent) !== payment.stripePaymentIntentId || refund.currency !== 'usd' ||
          !Number.isSafeInteger(refund.amount) || refund.amount <= 0 || refund.amount > payment.amountInCents ||
          !Number.isSafeInteger(refund.created) || refund.created < 0 || !Number.isFinite(new Date(refund.created * 1000).getTime())) {
        throw new RefundReconciliationError('Stripe refund identity, amount or status requires review')
      }
      const old = previous.find(item => item.id === refund.id)
      if (old && (old.amountInCents !== refund.amount || old.stripeChargeId !== chargeId || old.stripePaymentIntentId !== payment.stripePaymentIntentId || old.currency !== refund.currency)) {
        throw new RefundReconciliationError('A refund changed immutable financial identity')
      }
      if (status === 'SUCCEEDED') succeeded += refund.amount
      else if (status === 'PENDING' || status === 'REQUIRES_ACTION') pending += refund.amount
      else failed++
      return { id: refund.id, paymentId: payment.id, stripeChargeId: chargeId!, stripePaymentIntentId: payment.stripePaymentIntentId!,
        amountInCents: refund.amount, currency: refund.currency, status,
        transferReversalId: objectId(refund.transfer_reversal), sourceTransferReversalId: objectId(refund.source_transfer_reversal),
        failureBalanceTransactionId: objectId(refund.failure_balance_transaction), failureReason: refund.failure_reason || null,
        stripeCreatedAt: new Date(refund.created * 1000), observedAt }
    })
    if (!Number.isSafeInteger(succeeded + pending) || succeeded + pending > payment.amountInCents) throw new RefundReconciliationError('Refund totals exceed the recorded payment')
    const status = succeeded === payment.amountInCents ? 'REFUNDED' : succeeded > 0 ? 'PARTIALLY_REFUNDED' : 'SUCCEEDED'
    const changed = payment.status !== status || payment.refundAmountInCents !== succeeded || payment.refundPendingAmountInCents !== pending || payment.refundFailedCount !== failed ||
      rows.some(row => { const old = previous.find(item => item.id === row.id); return !old || old.status !== row.status || old.transferReversalId !== row.transferReversalId || old.failureBalanceTransactionId !== row.failureBalanceTransactionId })
    for (const row of rows) {
      const saved = await tx.paymentRefund.upsert({ where: { id: row.id }, create: row, update: { ...row, paymentId: undefined } })
      if (saved.paymentId !== payment.id) throw new RefundReconciliationError('Refund is already linked to a different payment')
    }
    await tx.payment.update({ where: { id: payment.id }, data: { stripeChargeId: chargeId, status,
      refundAmountInCents: succeeded, refundPendingAmountInCents: pending, refundFailedCount: failed, refundsVerifiedAt: observedAt } })
    if (status === 'REFUNDED') await tx.booking.updateMany({ where: { id: booking.id, status: { in: ['PENDING', 'CONFIRMED'] } }, data: { status: 'CANCELLED' } })
    if (changed && (rows.length || payment.refundAmountInCents > 0)) {
      const message = `Stripe refund status: $${(succeeded / 100).toFixed(2)} succeeded, $${(pending / 100).toFixed(2)} pending, ${failed} failed or cancelled. Pending amounts are not completed refunds. Contact support for unresolved amounts.`
      const notifications = [booking.parentProfile.userId, booking.trainerProfile.userId].map(userId => ({ userId, type: 'REFUND_STATUS_UPDATED', title: 'Refund status updated', message, data: { bookingId } }))
      if (pending || failed || succeeded < payment.refundAmountInCents) {
        const admins = await tx.user.findMany({ where: { role: 'ADMIN', deletedAt: null }, select: { id: true } })
        notifications.push(...admins.map(({ id }) => ({ userId: id, type: 'PAYMENT_REVIEW_REQUIRED', title: 'Refund needs reconciliation',
          message: 'Review customer refund status, transfer reversal and application fee in Stripe. Failed/cancelled refunds are not proof that the customer received money. Do not issue a replacement without reconciling existing refunds.', data: { bookingId } })))
      }
      await tx.notification.createMany({ data: notifications })
    }
    if (options.adminUserId && changed) await tx.adminAction.create({ data: { adminUserId: options.adminUserId, actionType: 'RECONCILE_REFUNDS', targetType: 'PAYMENT', targetId: payment.id,
      description: 'Refreshed refund records from Stripe without issuing money movement', metadata: { bookingId, succeeded, pending, failed, refundIds: rows.map(row => row.id) } } })
    return { bookingId, paymentId: payment.id, status, refundedAmountInCents: succeeded, pendingAmountInCents: pending, failedCount: failed, verifiedAt: observedAt, refunds: rows }
  }, { maxWait: 5000, timeout: 25000 })
}

export async function reconcileRefundEvent(chargeId: string, refundId?: string) {
  const charge = await stripe.charges.retrieve(chargeId, {}, requestOptions)
  if (charge.id !== chargeId) throw new RefundReconciliationError('Stripe charge identity requires review')
  const intentId = objectId(charge.payment_intent)
  const matches = await prisma.payment.findMany({ where: { OR: [
    { stripeChargeId: chargeId }, ...(intentId ? [{ stripePaymentIntentId: intentId }] : []),
    ...(charge.metadata?.paymentId && charge.metadata?.bookingId ? [{ id: charge.metadata.paymentId, bookingId: charge.metadata.bookingId }] : []),
  ] }, select: { id: true, bookingId: true }, take: 2 })
  if (!matches.length) {
    if (charge.metadata?.bookingId || charge.metadata?.paymentId) throw new RefundReconciliationError('TRAINR refund payment is not linked yet')
    return { ignored: true }
  }
  if (matches.length !== 1) throw new RefundReconciliationError('Stripe charge maps to multiple payments')
  return reconcilePaymentRefunds(matches[0].bookingId, { chargeId, refundId })
}
