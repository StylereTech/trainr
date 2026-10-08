import { prisma } from '@/lib/prisma'
import { verifyDestinationSettlement } from '@/lib/stripe-settlement'
import { reconcilePaymentRefunds } from '@/lib/refund-reconciliation'

export class PaymentEventConflict extends Error {}

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

export async function applyPaymentEvidence(evidence: PaymentEvidence) {
  if (evidence.outcome === 'refunded') throw new PaymentEventConflict('Refund snapshots require current Stripe refund reconciliation')
  const refundChargeId = await prisma.$transaction(async (tx) => {
    // Serialize related events, including distinct event IDs for the same payment.
    await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${evidence.bookingId} FOR UPDATE`
    await tx.$queryRaw`SELECT id FROM payments WHERE "bookingId" = ${evidence.bookingId} FOR UPDATE`
    const booking = await tx.booking.findUnique({
      where: { id: evidence.bookingId },
      include: { payment: true, parentProfile: true, trainerProfile: true },
    })
    const payment = booking?.payment
    if (!booking || !payment) throw new PaymentEventConflict('Booking payment requires reconciliation')
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
    if (payment.status === 'REFUNDED') return
    const settlement = await verifyDestinationSettlement({ ...booking, payment }, attempt, evidence.intentId, evidence.chargeId)
    const partiallyRefunded = payment.status === 'PARTIALLY_REFUNDED'
    const newlyPaid = payment.status !== 'SUCCEEDED' && !partiallyRefunded
    await tx.payment.update({
      where: { id: payment.id },
      data: { ...identity, stripeChargeId: settlement.chargeId, stripeTransferId: settlement.transferId,
        status: partiallyRefunded ? 'PARTIALLY_REFUNDED' : 'SUCCEEDED' },
    })
    const refundActivity = payment.refundAmountInCents > 0 || payment.refundPendingAmountInCents > 0 || payment.refundFailedCount > 0
    const confirmed = refundActivity || settlement.requiresReview ? { count: 0 } : await tx.booking.updateMany({
      where: { id: booking.id, status: 'PENDING' }, data: { status: 'CONFIRMED' },
    })
    const needsReview = settlement.requiresReview || booking.status === 'CANCELLED' || booking.status === 'RESCHEDULED'
    const newFinancialReview = settlement.requiresReview && !newlyPaid && !await tx.notification.findFirst({
      where: { userId: booking.parentProfile.userId, type: 'PAYMENT_REVIEW_REQUIRED', data: { path: ['bookingId'], equals: booking.id } },
      select: { id: true },
    })
    const reviewMessage = settlement.requiresReview
      ? 'Stripe reports a refund, dispute, transfer reversal or fee refund. Contact support to reconcile the payment. This is not a booking confirmation or bank payout receipt.'
      : 'Payment arrived for a cancelled or rescheduled booking. Contact support to reconcile the payment; the booking has not been reopened.'
    const notifications = []
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
        data: { bookingId: booking.id },
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
        data: { bookingId: booking.id },
      })
    }
    if (notifications.length) await tx.notification.createMany({ data: notifications })
    return settlement.hasRefunds ? settlement.chargeId : undefined
  }, { maxWait: 5000, timeout: 25000 })
  // Commit verified identities first so an early refund can resolve the payment; failures remain retryable.
  if (refundChargeId) await reconcilePaymentRefunds(evidence.bookingId, { chargeId: refundChargeId })
}
