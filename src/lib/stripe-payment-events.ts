import { prisma } from '@/lib/prisma'

export class PaymentEventConflict extends Error {}

export type PaymentEvidence = {
  bookingId: string
  paymentId?: string
  sessionId?: string
  intentId: string | null
  chargeId?: string | null
  amount: number | null
  currency: string | null
  outcome: 'paid' | 'failed' | 'refunded'
  refundAmount?: number
}

export async function applyPaymentEvidence(evidence: PaymentEvidence) {
  await prisma.$transaction(async (tx) => {
    // Serialize related events, including distinct event IDs for the same payment.
    await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${evidence.bookingId} FOR UPDATE`
    await tx.$queryRaw`SELECT id FROM payments WHERE "bookingId" = ${evidence.bookingId} FOR UPDATE`
    const booking = await tx.booking.findUnique({
      where: { id: evidence.bookingId },
      include: { payment: true, parentProfile: true, trainerProfile: true },
    })
    const payment = booking?.payment
    if (!booking || !payment) throw new PaymentEventConflict('Booking payment requires reconciliation')
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

    if (evidence.outcome === 'refunded') {
      const amount = evidence.refundAmount
      if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0 || amount > payment.amountInCents) {
        throw new PaymentEventConflict('Invalid cumulative refund amount')
      }
      // Stripe delivers snapshots out of order; never lower the recorded refund.
      if (amount < payment.refundAmountInCents) return
      const full = amount === payment.amountInCents
      await tx.payment.update({
        where: { id: payment.id },
        data: { ...identity, status: full ? 'REFUNDED' : 'PARTIALLY_REFUNDED', refundAmountInCents: amount },
      })
      if (full) {
        await tx.booking.updateMany({
          where: { id: booking.id, status: { in: ['PENDING', 'CONFIRMED'] } },
          data: { status: 'CANCELLED' },
        })
      }
      return
    }

    // A delayed success cannot undo a refund or a terminal booking decision.
    if (payment.status === 'REFUNDED') return
    const partiallyRefunded = payment.status === 'PARTIALLY_REFUNDED'
    const newlyPaid = payment.status !== 'SUCCEEDED' && !partiallyRefunded
    await tx.payment.update({
      where: { id: payment.id },
      data: { ...identity, status: partiallyRefunded ? 'PARTIALLY_REFUNDED' : 'SUCCEEDED' },
    })
    const confirmed = await tx.booking.updateMany({
      where: { id: booking.id, status: 'PENDING' }, data: { status: 'CONFIRMED' },
    })
    const needsReview = booking.status === 'CANCELLED' || booking.status === 'RESCHEDULED'
    const notifications = []
    if (newlyPaid || confirmed.count > 0) {
      notifications.push({
        userId: booking.trainerProfile.userId,
        type: needsReview ? 'PAYMENT_REVIEW_REQUIRED' : 'PAYMENT_RECEIVED',
        title: needsReview ? 'Payment requires review' : 'Payment received',
        message: needsReview
          ? 'Payment arrived for a cancelled or rescheduled booking. Contact support to reconcile the payment; the booking has not been reopened.'
          : partiallyRefunded
            ? 'Payment is confirmed with a partial refund recorded. Check Stripe for the remaining balance, transfer and bank payout status.'
            : `Payment of $${(payment.amountInCents / 100).toFixed(2)} received. Your recorded share is $${(payment.trainerPayoutInCents / 100).toFixed(2)}. Check Stripe for transfer and bank payout status.`,
        data: { bookingId: booking.id },
      })
    }
    if (confirmed.count > 0 || (newlyPaid && needsReview)) {
      notifications.push({
        userId: booking.parentProfile.userId,
        type: needsReview ? 'PAYMENT_REVIEW_REQUIRED' : 'BOOKING_CONFIRMED',
        title: needsReview ? 'Payment requires review' : 'Booking confirmed',
        message: needsReview
          ? 'Payment arrived after this booking was cancelled or rescheduled. Contact support for reconciliation. This is not a booking confirmation or refund receipt.'
          : `Your session with ${booking.trainerProfile.firstName} ${booking.trainerProfile.lastName} on ${booking.date.toISOString().slice(0, 10)} is confirmed.`,
        data: { bookingId: booking.id },
      })
    }
    if (notifications.length) await tx.notification.createMany({ data: notifications })
  })
}
