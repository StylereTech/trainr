import { prisma } from '@/lib/prisma'
import { verifyDestinationSettlement, type SettlementSource } from '@/lib/stripe-settlement'
import { reconcilePaymentRefundHistory } from '@/lib/payment-refunds'
import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'

export class PaymentEventConflict extends Error {}
export class PaymentEventAuthorizationError extends PaymentEventConflict {}

export type PaymentEvidence = {
  bookingId: string
  paymentId?: string
  attemptId?: string
  sessionId?: string
  intentId: string | null
  chargeId?: string | null
  amount: number | null
  currency: string | null
  outcome: 'paid' | 'failed' | 'refunded'
  refundAmount?: number
}

export async function applyPaymentEvidence(evidence: PaymentEvidence, source?: SettlementSource, options: { adminUserId?: string } = {}) {
  if (evidence.outcome === 'refunded') throw new PaymentEventConflict('Refund snapshots require current Stripe refund reconciliation')
  await prisma.$transaction(async (tx) => {
    if (options.adminUserId) {
      const actor = await tx.user.findUnique({ where: { id: options.adminUserId }, select: { role: true, deletedAt: true } })
      if (actor?.role !== 'ADMIN' || actor.deletedAt) throw new PaymentEventAuthorizationError('Administrator access is required')
    }
    const owners = await tx.booking.findUnique({ where: { id: evidence.bookingId }, select: {
      parentProfile: { select: { userId: true } }, trainerProfile: { select: { userId: true } },
    } })
    if (!owners) throw new PaymentEventConflict('Booking payment requires reconciliation')
    // Account writers and booking actions lock users first. Hold current roles through
    // provider verification and commit, then serialize the booking and payment.
    const accounts = await tx.$queryRaw<Array<{ id: string; role: string; deletedAt: Date | null }>>`
      SELECT id, role, "deletedAt" FROM users
      WHERE id IN (${owners.parentProfile.userId}, ${owners.trainerProfile.userId}, ${options.adminUserId || ''})
        OR (role = 'ADMIN' AND "deletedAt" IS NULL)
      ORDER BY id FOR SHARE`
    if (options.adminUserId && !accounts.some(account => account.id === options.adminUserId && account.role === 'ADMIN' && !account.deletedAt)) {
      throw new PaymentEventAuthorizationError('Administrator access is required')
    }
    await tx.$queryRaw`SELECT id FROM trainer_profiles WHERE id = (SELECT "trainerProfileId" FROM bookings WHERE id = ${evidence.bookingId}) FOR SHARE`
    await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${evidence.bookingId} FOR UPDATE`
    await tx.$queryRaw`SELECT id FROM payments WHERE "bookingId" = ${evidence.bookingId} FOR UPDATE`
    const booking = await tx.booking.findUnique({
      where: { id: evidence.bookingId },
      include: { payment: true, parentProfile: true, trainerProfile: true },
    })
    const payment = booking?.payment
    if (!booking || !payment) throw new PaymentEventConflict('Booking payment requires reconciliation')
    if (booking.parentProfile.userId !== owners.parentProfile.userId || booking.trainerProfile.userId !== owners.trainerProfile.userId) {
      throw new PaymentEventConflict('Booking ownership changed; retry reconciliation')
    }
    const attempt = await tx.checkoutAttempt.findFirst({ where: { paymentId: payment.id }, orderBy: { sequence: 'desc' } })
    if ((evidence.attemptId && evidence.attemptId !== attempt?.id) || attempt?.retiredAt ||
        (attempt && evidence.attemptId !== attempt.id &&
          evidence.sessionId !== attempt.stripeCheckoutSessionId && evidence.intentId !== payment.stripePaymentIntentId) ||
        (evidence.sessionId && attempt?.stripeCheckoutSessionId && evidence.sessionId !== attempt.stripeCheckoutSessionId)) {
      throw new PaymentEventConflict('Stripe event belongs to a different checkout attempt')
    }
    if (evidence.currency !== 'usd' || evidence.amount !== payment.amountInCents ||
        payment.amountInCents !== booking.totalAmountInCents) {
      throw new PaymentEventConflict('Payment amount or currency does not match booking')
    }
    if (!evidence.intentId ||
        (evidence.paymentId && evidence.paymentId !== payment.id) ||
        (payment.stripePaymentIntentId && payment.stripePaymentIntentId !== evidence.intentId) ||
        (evidence.sessionId && payment.stripeCheckoutSessionId && payment.stripeCheckoutSessionId !== evidence.sessionId) ||
        (evidence.chargeId && payment.stripeChargeId && payment.stripeChargeId !== evidence.chargeId)) {
      throw new PaymentEventConflict('Stripe payment identity does not match booking')
    }
    const linked = evidence.paymentId === payment.id ||
      payment.stripePaymentIntentId === evidence.intentId ||
      (evidence.sessionId && payment.stripeCheckoutSessionId === evidence.sessionId)
    if (!linked) throw new PaymentEventConflict('Stripe payment is not linked to this booking')
    if (attempt && evidence.sessionId && !attempt.stripeCheckoutSessionId) {
      await tx.checkoutAttempt.update({ where: { id: attempt.id }, data: { stripeCheckoutSessionId: evidence.sessionId } })
    }

    const identity = {
      stripePaymentIntentId: evidence.intentId,
      ...(evidence.sessionId ? { stripeCheckoutSessionId: evidence.sessionId } : {}),
      ...(evidence.chargeId ? { stripeChargeId: evidence.chargeId } : {}),
    }

    if (evidence.outcome === 'failed') {
      if (payment.status === 'PENDING' || payment.status === 'PROCESSING' || payment.status === 'FAILED') {
        await tx.payment.update({ where: { id: payment.id }, data: { ...identity, status: 'FAILED' } })
      }
      return
    }

    // A delayed success cannot undo a refund or a terminal booking decision.
    const settlement = await verifyDestinationSettlement({ ...booking, payment }, attempt, evidence.intentId, evidence.chargeId, source)
    const refunds = await reconcilePaymentRefundHistory(tx, payment, evidence.intentId, settlement.chargeId, settlement.hasRefunds)
    const refundActivity = refunds.succeeded > 0 || refunds.pending > 0 || refunds.failed > 0
    const parent = accounts.find(account => account.id === booking.parentProfile.userId)
    const trainer = accounts.find(account => account.id === booking.trainerProfile.userId)
    const retirement = await tx.accountCheckoutClosure.findFirst({ where: { kind: 'BOOKING', targetId: payment.id, status: { not: 'CLOSED' } } })
    const participantReview = [
      ...(retirement ? ['checkout_retirement_pending'] : []),
      ...(!parent || parent.deletedAt || parent.role !== 'PARENT' ? ['parent_account_unavailable'] : []),
      ...(!trainer || trainer.deletedAt || trainer.role !== 'TRAINER' ? ['trainer_account_unavailable'] : []),
    ]
    const reviewDetails = participantReview.length || refundActivity ? { ...settlement.review?.details, participantReview,
      paymentRefunds: { refundedInCents: refunds.succeeded, pendingInCents: refunds.pending, failedCount: refunds.failed } } : null
    const review = reviewDetails ? {
      key: createHash('sha256').update(JSON.stringify({ bookingId: booking.id, ...reviewDetails })).digest('hex'), details: reviewDetails,
    } : settlement.review
    const requiresReview = settlement.requiresReview || participantReview.length > 0 || refundActivity
    const partiallyRefunded = refunds.status === 'PARTIALLY_REFUNDED'
    const newlyPaid = !['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(payment.status)
    await tx.payment.update({
      where: { id: payment.id },
      data: { ...identity, stripeChargeId: settlement.chargeId, stripeTransferId: settlement.transferId,
        settlementVerifiedAt: new Date(), financialReview: review ? JSON.parse(JSON.stringify(review)) : Prisma.DbNull,
        status: refunds.status, refundAmountInCents: refunds.succeeded, refundPendingAmountInCents: refunds.pending,
        refundFailedCount: refunds.failed, refundsVerifiedAt: refunds.observedAt },
    })
    if (refunds.status === 'REFUNDED') await tx.booking.updateMany({
      where: { id: booking.id, status: { in: ['PENDING', 'CONFIRMED'] } }, data: { status: 'CANCELLED' },
    })
    const confirmed = refundActivity || requiresReview ? { count: 0 } : await tx.booking.updateMany({
      where: { id: booking.id, status: 'PENDING' }, data: { status: 'CONFIRMED' },
    })
    const needsReview = requiresReview || booking.status === 'CANCELLED' || booking.status === 'RESCHEDULED'
    const newFinancialReview = review && !await tx.notification.findFirst({
      where: { type: 'PAYMENT_REVIEW_REQUIRED', AND: [
        { data: { path: ['bookingId'], equals: booking.id } },
        { data: { path: ['financialReviewKey'], equals: review.key } },
      ] },
      select: { id: true },
    })
    const reviewMessage = retirement
      ? 'Payment was received while an earlier checkout was awaiting retirement after an account or trainer access change. Contact support to reconcile the payment. This is not a booking confirmation, refund or bank payout receipt.'
      : participantReview.length
      ? 'Payment was received, but a parent or trainer account is closed or no longer has the required role. Contact support to reconcile the payment and session. This is not a booking confirmation, refund or bank payout receipt.'
      : settlement.requiresReview || refundActivity
      ? 'Stripe reports a refund, dispute, transfer reversal or fee refund. Contact support to reconcile the payment. This is not a booking confirmation or bank payout receipt.'
      : 'Payment arrived for a cancelled or rescheduled booking. Contact support to reconcile the payment; the booking has not been reopened.'
    const notifications = []
    const notificationData = { bookingId: booking.id, ...(review ? {
      financialReviewKey: review.key, financialReview: review.details,
    } : {}) }
    if (newlyPaid || confirmed.count > 0 || newFinancialReview) {
      notifications.push({
        userId: booking.trainerProfile.userId,
        type: needsReview ? 'PAYMENT_REVIEW_REQUIRED' : 'PAYMENT_RECEIVED',
        title: needsReview ? 'Payment requires review' : 'Payment received',
        message: needsReview
          ? reviewMessage
          : partiallyRefunded
            ? 'Payment is confirmed with a partial refund recorded. Check Stripe for the remaining balance, transfer and bank payout status.'
            : `Payment of $${(payment.amountInCents / 100).toFixed(2)} received. Your recorded share is $${(payment.trainerPayoutInCents / 100).toFixed(2)}. Check Stripe for transfer and bank payout status.`,
        data: notificationData,
      })
    }
    if (confirmed.count > 0 || (newlyPaid && needsReview) || newFinancialReview) {
      notifications.push({
        userId: booking.parentProfile.userId,
        type: needsReview ? 'PAYMENT_REVIEW_REQUIRED' : 'BOOKING_CONFIRMED',
        title: needsReview ? 'Payment requires review' : 'Booking confirmed',
        message: needsReview
          ? reviewMessage
          : `Your session with ${booking.trainerProfile.firstName} ${booking.trainerProfile.lastName} on ${booking.date.toISOString().slice(0, 10)} is confirmed.`,
        data: notificationData,
      })
    }
    if (newFinancialReview || (newlyPaid && needsReview)) {
      const admins = accounts.filter(account => account.role === 'ADMIN' && !account.deletedAt)
      for (const admin of admins) {
        if (notifications.some(item => item.userId === admin.id)) continue
        notifications.push({ userId: admin.id, type: 'PAYMENT_REVIEW_REQUIRED', title: 'Stripe payment needs review',
          message: retirement
            ? 'Payment arrived while checkout retirement was unresolved. Review the account-access change and Stripe receipts before resolving the booking or moving money.'
            : participantReview.length
            ? 'Payment arrived for an unavailable parent or trainer account. Review the account, session and Stripe receipts before issuing money movement. No booking confirmation or refund was issued by this review.'
            : settlement.requiresReview || refundActivity
            ? 'Review the current customer refund, dispute, transfer reversal or fee refund in Stripe. Check evidence deadlines and reconcile the customer and trainer balances before issuing money movement.'
            : 'Payment arrived for a cancelled or rescheduled booking. The booking has not been reopened. Review the payment in Stripe and reconcile the customer and trainer balances before issuing money movement.', data: notificationData })
      }
    }
    const recipients = new Set(accounts.filter(account => !account.deletedAt && (
      account.role === 'ADMIN' || (account.id === parent?.id && account.role === 'PARENT') ||
      (account.id === trainer?.id && account.role === 'TRAINER'))).map(account => account.id))
    const deliverable = notifications.filter(notification => recipients.has(notification.userId))
    if (deliverable.length) await tx.notification.createMany({ data: deliverable })
    if (options.adminUserId) await tx.adminAction.create({ data: {
      adminUserId: options.adminUserId, actionType: 'RECONCILE_PAYMENT', targetType: 'PAYMENT', targetId: payment.id,
      description: 'Verified existing Stripe settlement without issuing money movement',
      metadata: { bookingId: booking.id, chargeId: settlement.chargeId, transferId: settlement.transferId, requiresReview: needsReview || refundActivity, refundReconciliationRequired: false },
    } })
  }, { maxWait: 5000, timeout: 25000 })
}
