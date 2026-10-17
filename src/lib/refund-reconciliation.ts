import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'
import { SettlementConflict, verifyDestinationSettlement } from '@/lib/stripe-settlement'
import { RefundReconciliationError } from '@/lib/stripe-refund-history'
import { reconcilePaymentRefundHistory } from '@/lib/payment-refunds'
import { reconcilePackageCharge } from '@/lib/package-settlement'
import { paymentFinancialReview } from '@/lib/payment-financial-review'

export { RefundReconciliationError } from '@/lib/stripe-refund-history'
const requestOptions = { timeout: 4000, maxNetworkRetries: 0 }
function objectId(value: string | { id: string } | null | undefined) { return typeof value === 'string' ? value : value?.id || null }

export async function reconcilePaymentRefunds(bookingId: string, options: { adminUserId?: string; chargeId?: string; refundId?: string } = {}) {
  return prisma.$transaction(async tx => {
    if (options.adminUserId) {
      const actor = await tx.user.findUnique({ where: { id: options.adminUserId }, select: { role: true, deletedAt: true } })
      if (actor?.role !== 'ADMIN' || actor.deletedAt) throw new RefundReconciliationError('Administrator access is required', 403)
    }
    const owners = await tx.booking.findUnique({ where: { id: bookingId }, select: {
      parentProfile: { select: { userId: true } }, trainerProfile: { select: { userId: true } },
    } })
    if (!owners) throw new RefundReconciliationError('Booking payment not found', 404)
    // Match paid-event/account-writer order and retain recipient authority through commit.
    const accounts = await tx.$queryRaw<Array<{ id: string; role: string; deletedAt: Date | null }>>`
      SELECT id, role, "deletedAt" FROM users
      WHERE id IN (${owners.parentProfile.userId}, ${owners.trainerProfile.userId}, ${options.adminUserId || ''})
        OR (role = 'ADMIN' AND "deletedAt" IS NULL)
      ORDER BY id FOR SHARE`
    if (options.adminUserId && !accounts.some(account => account.id === options.adminUserId && account.role === 'ADMIN' && !account.deletedAt)) {
      throw new RefundReconciliationError('Administrator access is required', 403)
    }
    await tx.$queryRaw`SELECT id FROM trainer_profiles WHERE id = (SELECT "trainerProfileId" FROM bookings WHERE id = ${bookingId}) FOR SHARE`
    // Serialize the provider read with settlement/reconciliation so an older HTTP response cannot overwrite a newer observation.
    await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${bookingId} FOR UPDATE`
    await tx.$queryRaw`SELECT id FROM payments WHERE "bookingId" = ${bookingId} FOR UPDATE`
    const booking = await tx.booking.findUnique({ where: { id: bookingId }, include: { payment: true, parentProfile: true, trainerProfile: true } })
    const payment = booking?.payment
    if (!booking || !payment) throw new RefundReconciliationError('Booking payment not found', 404)
    if (booking.parentProfile.userId !== owners.parentProfile.userId || booking.trainerProfile.userId !== owners.trainerProfile.userId) {
      throw new RefundReconciliationError('Booking ownership changed; retry reconciliation')
    }
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
    // Refund reads can promote payment state too; require the same destination receipt as paid events.
    const attempt = await tx.checkoutAttempt.findFirst({ where: { paymentId: payment.id }, orderBy: { sequence: 'desc' } })
    let settlement
    try {
      settlement = await verifyDestinationSettlement({ ...booking, payment }, attempt, payment.stripePaymentIntentId, chargeId)
    } catch (error) {
      if (error instanceof SettlementConflict) throw new RefundReconciliationError(error.message)
      throw error
    }
    const { rows, previous, succeeded, pending, failed, status, observedAt } = await reconcilePaymentRefundHistory(
      tx, payment, payment.stripePaymentIntentId, chargeId, settlement.hasRefunds, options.refundId)
    const parent = accounts.find(account => account.id === booking.parentProfile.userId)
    const trainer = accounts.find(account => account.id === booking.trainerProfile.userId)
    const retirement = await tx.accountCheckoutClosure.findFirst({ where: { kind: 'BOOKING', targetId: payment.id, status: { not: 'CLOSED' } } })
    const participantReview = [
      ...(retirement ? ['checkout_retirement_pending'] : []),
      ...(!parent || parent.deletedAt || parent.role !== 'PARENT' ? ['parent_account_unavailable'] : []),
      ...(!trainer || trainer.deletedAt || trainer.role !== 'TRAINER' ? ['trainer_account_unavailable'] : []),
    ]
    const { review, requiresReview } = paymentFinancialReview(booking.id, settlement, { succeeded, pending, failed }, participantReview)
    const changed = payment.stripeChargeId !== settlement.chargeId || payment.stripeTransferId !== settlement.transferId ||
      !payment.settlementVerifiedAt || (payment.financialReview as { key?: string } | null)?.key !== review?.key ||
      payment.status !== status || payment.refundAmountInCents !== succeeded || payment.refundPendingAmountInCents !== pending || payment.refundFailedCount !== failed ||
      rows.some(row => { const old = previous.find(item => item.id === row.id); return !old || old.status !== row.status || old.transferReversalId !== row.transferReversalId || old.failureBalanceTransactionId !== row.failureBalanceTransactionId })
    await tx.payment.update({ where: { id: payment.id }, data: { stripeChargeId: settlement.chargeId, stripeTransferId: settlement.transferId, status,
      settlementVerifiedAt: observedAt, financialReview: review ? JSON.parse(JSON.stringify(review)) : Prisma.DbNull,
      refundAmountInCents: succeeded, refundPendingAmountInCents: pending, refundFailedCount: failed, refundsVerifiedAt: observedAt } })
    if (status === 'REFUNDED') await tx.booking.updateMany({ where: { id: booking.id, status: { in: ['PENDING', 'CONFIRMED'] } }, data: { status: 'CANCELLED' } })
    if (changed && (rows.length || payment.refundAmountInCents > 0)) {
      const message = `Stripe refund status: $${(succeeded / 100).toFixed(2)} succeeded, $${(pending / 100).toFixed(2)} pending, ${failed} failed or cancelled. Pending amounts are not completed refunds. Contact support for unresolved amounts.`
      const notifications = [booking.parentProfile.userId, booking.trainerProfile.userId].map(userId => ({ userId, type: 'REFUND_STATUS_UPDATED', title: 'Refund status updated', message, data: { bookingId } }))
      if (pending || failed || succeeded < payment.refundAmountInCents) {
        const admins = accounts.filter(account => account.role === 'ADMIN' && !account.deletedAt)
        notifications.push(...admins.map(({ id }) => ({ userId: id, type: 'PAYMENT_REVIEW_REQUIRED', title: 'Refund needs reconciliation',
          message: 'Review customer refund status, transfer reversal and application fee in Stripe. Failed/cancelled refunds are not proof that the customer received money. Do not issue a replacement without reconciling existing refunds.', data: { bookingId } })))
      }
      const recipients = new Set(accounts.filter(account => !account.deletedAt && (account.role === 'ADMIN' ||
        (account.id === parent?.id && account.role === 'PARENT') || (account.id === trainer?.id && account.role === 'TRAINER'))).map(account => account.id))
      const deliverable = notifications.filter(notification => recipients.has(notification.userId))
      if (deliverable.length) await tx.notification.createMany({ data: deliverable })
    }
    if (options.adminUserId && changed) await tx.adminAction.create({ data: { adminUserId: options.adminUserId, actionType: 'RECONCILE_REFUNDS', targetType: 'PAYMENT', targetId: payment.id,
      description: 'Refreshed refund records from Stripe without issuing money movement', metadata: { bookingId, chargeId: settlement.chargeId, transferId: settlement.transferId, requiresReview, succeeded, pending, failed, refundIds: rows.map(row => row.id) } } })
    return { bookingId, paymentId: payment.id, status, refundedAmountInCents: succeeded, pendingAmountInCents: pending, failedCount: failed, verifiedAt: observedAt, refunds: rows }
  }, { maxWait: 5000, timeout: 45000 })
}

export async function reconcileRefundEvent(chargeId: string, refundId?: string) {
  const charge = await stripe.charges.retrieve(chargeId, {}, requestOptions)
  if (charge.id !== chargeId) throw new RefundReconciliationError('Stripe charge identity requires review')
  const intentId = objectId(charge.payment_intent)
  const matches = await prisma.payment.findMany({ where: { OR: [
    { stripeChargeId: chargeId }, ...(intentId ? [{ stripePaymentIntentId: intentId }] : []),
    ...(charge.metadata?.paymentId && charge.metadata?.bookingId ? [{ id: charge.metadata.paymentId, bookingId: charge.metadata.bookingId }] : []),
  ] }, select: { id: true, bookingId: true }, take: 2 })
  if (await reconcilePackageCharge(charge, {}, matches.length > 0, { refundId })) return { ignored: false }
  if (!matches.length) {
    if (charge.metadata?.bookingId || charge.metadata?.paymentId) throw new RefundReconciliationError('TRAINR refund payment is not linked yet')
    return { ignored: true }
  }
  if (matches.length !== 1) throw new RefundReconciliationError('Stripe charge maps to multiple payments')
  return reconcilePaymentRefunds(matches[0].bookingId, { chargeId, refundId })
}
