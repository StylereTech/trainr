import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'
import { applyPaymentEvidence, PaymentEventAuthorizationError } from '@/lib/stripe-payment-events'

export class PaymentReconciliationError extends Error {
  constructor(message: string, public readonly status = 409) { super(message) }
}
const requestOptions = { timeout: 4000, maxNetworkRetries: 0 }
const objectId = (value: string | { id: string } | null) => typeof value === 'string' ? value : value?.id || null

export async function reconcileBookingPayment(bookingId: string, adminUserId: string) {
  const snapshot = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${adminUserId} FOR SHARE`
    const actor = await tx.user.findUnique({ where: { id: adminUserId }, select: { role: true, deletedAt: true } })
    if (actor?.role !== 'ADMIN' || actor.deletedAt) throw new PaymentEventAuthorizationError('Administrator access is required')
    await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${bookingId} FOR UPDATE`
    await tx.$queryRaw`SELECT id FROM payments WHERE "bookingId" = ${bookingId} FOR UPDATE`
    const payment = await tx.payment.findUnique({ where: { bookingId } })
    if (!payment) throw new PaymentReconciliationError('Booking payment not found', 404)
    const attempt = await tx.checkoutAttempt.findFirst({ where: { paymentId: payment.id }, orderBy: { sequence: 'desc' } })
    if (!attempt || attempt.retiredAt || payment.amountInCents <= 0) throw new PaymentReconciliationError('Saved checkout evidence requires manual review')
    if (attempt.stripeCheckoutSessionId && payment.stripeCheckoutSessionId && attempt.stripeCheckoutSessionId !== payment.stripeCheckoutSessionId) {
      throw new PaymentReconciliationError('Saved checkout identities disagree; manual review is required')
    }
    return { payment, attempt }
  })
  const { payment, attempt } = snapshot
  const sessionId = attempt.stripeCheckoutSessionId || payment.stripeCheckoutSessionId
  let intentId = payment.stripePaymentIntentId
  if (sessionId) {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {}, requestOptions)
    if (session.id !== sessionId || session.mode !== 'payment' || session.amount_total !== payment.amountInCents || session.currency !== 'usd' ||
        session.metadata?.bookingId !== bookingId || session.metadata?.paymentId !== payment.id || session.metadata?.checkoutAttemptId !== attempt.id ||
        (intentId && objectId(session.payment_intent) !== intentId)) {
      throw new PaymentReconciliationError('Stripe checkout identity or amount requires manual review')
    }
    if (session.status !== 'complete' || session.payment_status !== 'paid') throw new PaymentReconciliationError('Stripe has not confirmed a completed payment. No new checkout was created.')
    intentId = objectId(session.payment_intent)
  }
  if (!intentId) throw new PaymentReconciliationError('No saved Stripe payment identity. Review the original provider request; do not charge again.')
  // Current actor, attempt, money and receipt chain are rechecked under settlement locks.
  // This also verifies current refunds for previously fully refunded payments.
  await applyPaymentEvidence({ bookingId, paymentId: payment.id, attemptId: attempt.id,
    ...(sessionId ? { sessionId } : {}), intentId, amount: payment.amountInCents, currency: 'usd', outcome: 'paid' }, {}, { adminUserId })
  return { reconciled: true }
}
