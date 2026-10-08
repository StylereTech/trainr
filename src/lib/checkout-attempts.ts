import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import type Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'
import { toAbsoluteAppUrl } from '@/lib/app-url'
import { applyPaymentEvidence } from '@/lib/stripe-payment-events'
import { isSupportedBookingTotal } from '@/lib/fees'

export class CheckoutConflict extends Error {}
type Buyer = { id: string; email?: string | null }
type ExpiredSession = { id: string; intentId: string | null }
const RECOVERY_WINDOW_MS = 23 * 60 * 60 * 1000

async function lockCurrentBuyer(tx: Prisma.TransactionClient, buyerId: string) {
  // Account revocation writers lock users first; never hold this lock across Stripe calls.
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${buyerId} FOR SHARE`
  const user = await tx.user.findUnique({ where: { id: buyerId }, select: { role: true, deletedAt: true } })
  return user?.role === 'PARENT' && !user.deletedAt
}

async function lockedBooking(tx: Prisma.TransactionClient, bookingId: string) {
  await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${bookingId} FOR UPDATE`
  await tx.$queryRaw`SELECT id FROM payments WHERE "bookingId" = ${bookingId} FOR UPDATE`
  await tx.$queryRaw`SELECT id FROM trainer_profiles WHERE id = (SELECT "trainerProfileId" FROM bookings WHERE id = ${bookingId}) FOR SHARE`
  return tx.booking.findUnique({
    where: { id: bookingId },
    include: { parentProfile: true, trainerProfile: true, athleteProfile: true, serviceOffering: true, payment: true },
  })
}

type CheckoutBooking = NonNullable<Awaited<ReturnType<typeof lockedBooking>>>

function assertPayable(booking: CheckoutBooking | null, buyer: Buyer, accountId: string) {
  if (!booking || booking.parentProfile.userId !== buyer.id) throw new CheckoutConflict('Booking ownership changed. Refresh before retrying.')
  if (!['PENDING', 'CONFIRMED'].includes(booking.status)) throw new CheckoutConflict('Booking cannot be paid in its current state.')
  if (booking.trainerProfile.stripeAccountId !== accountId) throw new CheckoutConflict('Trainer payment account changed. Refresh before retrying.')
  const payment = booking.payment
  if (payment && (!['PENDING', 'FAILED'].includes(payment.status) || payment.stripeChargeId || payment.stripeTransferId || payment.refundAmountInCents > 0)) {
    throw new CheckoutConflict('Payment already has financial activity. Refresh your booking or contact support.')
  }
  if (payment && (payment.amountInCents !== booking.totalAmountInCents || payment.platformFeeInCents !== booking.platformFeeInCents || payment.trainerPayoutInCents !== booking.trainerPayoutInCents)) {
    throw new CheckoutConflict('Stored payment amounts require reconciliation.')
  }
  if (!isSupportedBookingTotal(booking.totalAmountInCents) || booking.totalAmountInCents === 0 ||
      !Number.isSafeInteger(booking.platformFeeInCents) || !Number.isSafeInteger(booking.trainerPayoutInCents) ||
      booking.platformFeeInCents < 0 || booking.trainerPayoutInCents < 0 ||
      booking.platformFeeInCents + booking.trainerPayoutInCents !== booking.totalAmountInCents) {
    throw new CheckoutConflict('Booking payment amounts are invalid.')
  }
}

function parameters(booking: CheckoutBooking, paymentId: string, attemptId: string, buyer: Buyer, accountId: string): Stripe.Checkout.SessionCreateParams {
  const metadata = { bookingId: booking.id, paymentId, checkoutAttemptId: attemptId }
  return {
    payment_method_types: ['card'], mode: 'payment',
    ...(buyer.email ? { customer_email: buyer.email } : {}),
    line_items: [{
      price_data: {
        currency: 'usd', unit_amount: booking.totalAmountInCents,
        product_data: {
          name: `${booking.serviceOffering.title} with ${booking.trainerProfile.firstName} ${booking.trainerProfile.lastName}`,
          description: `${booking.date.toISOString().slice(0, 10)} at ${booking.startTime}`,
        },
      }, quantity: 1,
    }],
    payment_intent_data: {
      application_fee_amount: booking.platformFeeInCents,
      transfer_data: { destination: accountId },
      metadata: {
        ...metadata, parentId: booking.parentProfile.id, trainerId: booking.trainerProfile.id,
        athleteId: booking.athleteProfile.id, serviceOfferingId: booking.serviceOffering.id,
        platformFeeInCents: String(booking.platformFeeInCents), trainerPayoutInCents: String(booking.trainerPayoutInCents),
      },
    },
    metadata,
    success_url: toAbsoluteAppUrl('/parent/dashboard?payment=success'),
    cancel_url: toAbsoluteAppUrl('/parent/dashboard?payment=cancelled'),
  }
}

async function prepare(bookingId: string, buyer: Buyer, accountId: string, expired?: ExpiredSession) {
  return prisma.$transaction(async (tx) => {
    if (!await lockCurrentBuyer(tx, buyer.id)) throw new CheckoutConflict('Parent access is required for checkout. Sign in again before retrying.')
    const booking = await lockedBooking(tx, bookingId)
    assertPayable(booking, buyer, accountId)
    if (!booking) throw new CheckoutConflict('Booking not found.')
    if (!booking.trainerProfile.isActive || booking.trainerProfile.approvalStatus !== 'APPROVED') {
      throw new CheckoutConflict('Trainer is not available for checkout. Contact support about this booking.')
    }
    let payment = booking.payment || await tx.payment.create({
      data: { bookingId, amountInCents: booking.totalAmountInCents, platformFeeInCents: booking.platformFeeInCents, trainerPayoutInCents: booking.trainerPayoutInCents },
    })
    let attempt = await tx.checkoutAttempt.findFirst({ where: { paymentId: payment.id }, orderBy: { sequence: 'desc' } })
    const sessionId = attempt?.stripeCheckoutSessionId || payment.stripeCheckoutSessionId

    if (expired && expired.id === sessionId) {
      if (payment.stripePaymentIntentId && payment.stripePaymentIntentId !== expired.intentId) {
        throw new CheckoutConflict('Previous payment intent requires reconciliation.')
      }
      if (attempt) {
        await tx.checkoutAttempt.update({ where: { id: attempt.id }, data: { retiredAt: new Date() } })
      } else {
        // Preserve the identity of a pre-migration session before allowing its replacement.
        attempt = await tx.checkoutAttempt.create({ data: {
          paymentId: payment.id, sequence: 1, parameters: {}, stripeCheckoutSessionId: expired.id, retiredAt: new Date(),
        } })
      }
      payment = await tx.payment.update({ where: { id: payment.id }, data: {
        stripeCheckoutSessionId: null, stripePaymentIntentId: null, status: 'PENDING',
      } })
    } else if (attempt && !attempt.retiredAt) {
      const saved = attempt.parameters as unknown as Stripe.Checkout.SessionCreateParams
      if (saved.payment_intent_data?.transfer_data?.destination !== accountId) {
        throw new CheckoutConflict('Saved checkout destination requires reconciliation.')
      }
      return { payment, attempt, legacySessionId: null }
    } else if (sessionId) {
      return { payment, attempt: null, legacySessionId: sessionId }
    } else if (payment.stripePaymentIntentId) {
      throw new CheckoutConflict('An unlinked payment intent requires reconciliation.')
    } else if (booking.payment && !attempt) {
      // An older request may have reached Stripe without saving the resulting session ID.
      throw new CheckoutConflict('Legacy checkout outcome is unknown. Contact support before retrying.')
    }

    const id = randomUUID()
    const saved = parameters(booking, payment.id, id, buyer, accountId)
    const next = await tx.checkoutAttempt.create({ data: {
      id, paymentId: payment.id, sequence: (attempt?.sequence || 0) + 1,
      parameters: JSON.parse(JSON.stringify(saved)) as Prisma.InputJsonObject,
    } })
    return { payment, attempt: next, legacySessionId: null }
  })
}

function objectId(value: string | { id: string } | null) {
  return typeof value === 'string' ? value : value?.id || null
}

function validateSession(session: Stripe.Checkout.Session, bookingId: string, paymentId: string, amount: number, attemptId?: string) {
  if (!session.id || session.mode !== 'payment' || session.currency !== 'usd' || session.amount_total !== amount ||
      session.metadata?.bookingId !== bookingId || session.metadata?.paymentId !== paymentId ||
      (attemptId && session.metadata?.checkoutAttemptId !== attemptId)) {
    throw new CheckoutConflict('Stripe checkout identity or amount requires reconciliation.')
  }
}

async function rememberSession(bookingId: string, buyer: Buyer, accountId: string, session: Stripe.Checkout.Session, attemptId: string | null) {
  const sessionId = session.id
  const { recorded, buyerAllowed } = await prisma.$transaction(async (tx) => {
    const buyerAllowed = await lockCurrentBuyer(tx, buyer.id)
    const booking = await lockedBooking(tx, bookingId)
    if (!booking?.payment) throw new CheckoutConflict('Payment record not found.')
    if (booking.parentProfile.userId !== buyer.id || booking.trainerProfile.stripeAccountId !== accountId) {
      throw new CheckoutConflict('Checkout ownership or destination changed. Contact support.')
    }
    const current = await tx.checkoutAttempt.findFirst({ where: { paymentId: booking.payment.id }, orderBy: { sequence: 'desc' } })
    if (attemptId && (!current || current.id !== attemptId || current.retiredAt)) throw new CheckoutConflict('Checkout attempt has changed. Refresh before retrying.')
    if (!attemptId && current) throw new CheckoutConflict('Legacy checkout has been replaced.')
    if ((current?.stripeCheckoutSessionId && current.stripeCheckoutSessionId !== sessionId) ||
        (booking.payment.stripeCheckoutSessionId && booking.payment.stripeCheckoutSessionId !== sessionId)) {
      throw new CheckoutConflict('Checkout session has changed. Refresh before retrying.')
    }
    if (current) await tx.checkoutAttempt.update({ where: { id: current.id }, data: { stripeCheckoutSessionId: sessionId } })
    await tx.payment.update({ where: { id: booking.payment.id }, data: { stripeCheckoutSessionId: sessionId } })
    return { recorded: booking, buyerAllowed }
  })
  // Save the provider identity even when cancellation wins the external-call race.
  if (recorded.status === 'CANCELLED') await closeCancelledCheckout(bookingId)
  const trainerAllowed = recorded.trainerProfile.isActive && recorded.trainerProfile.approvalStatus === 'APPROVED'
  if (!buyerAllowed || !trainerAllowed) {
    // Retain the returned identity before best-effort expiry. No refund or closure is implied.
    if (session.status === 'open' && session.payment_status === 'unpaid') {
      try {
        const expired = await stripe.checkout.sessions.expire(sessionId, {}, { timeout: 8000, maxNetworkRetries: 0, idempotencyKey: `trainr-withheld-${sessionId}` })
        validateSession(expired, bookingId, recorded.payment!.id, recorded.payment!.amountInCents, attemptId || undefined)
        if (expired.id !== sessionId || expired.status !== 'expired' || expired.payment_status !== 'unpaid' || expired.after_expiration?.recovery?.enabled) {
          throw new CheckoutConflict('Withheld session expiry requires reconciliation')
        }
      } catch { console.error('Withheld checkout expiry could not be verified; reconciliation required') }
    }
    throw new CheckoutConflict(!buyerAllowed
      ? 'Parent account access changed. Checkout was withheld; contact support to reconcile any payment.'
      : 'Trainer is no longer available for checkout. Checkout was withheld; contact support to reconcile any payment.')
  }
  assertPayable(recorded, buyer, accountId)
}

export type CheckoutClosure = 'closed' | 'not_required' | 'review_required'

export async function closeCancelledCheckout(bookingId: string): Promise<CheckoutClosure> {
  try {
    const snapshot = await prisma.$transaction(async tx => {
      const booking = await lockedBooking(tx, bookingId)
      if (!booking || booking.status !== 'CANCELLED') throw new CheckoutConflict('Booking is not cancelled')
      const attempt = booking.payment ? await tx.checkoutAttempt.findFirst({ where: { paymentId: booking.payment.id }, orderBy: { sequence: 'desc' } }) : null
      return { booking, attempt }
    })
    const { booking, attempt } = snapshot
    const payment = booking.payment
    if (!payment) return 'not_required'
    if (payment.amountInCents === 0 && !payment.stripeCheckoutSessionId && !payment.stripePaymentIntentId && !attempt) return 'not_required'
    const knownId = attempt?.stripeCheckoutSessionId || payment.stripeCheckoutSessionId
    if (attempt?.stripeCheckoutSessionId && payment.stripeCheckoutSessionId && attempt.stripeCheckoutSessionId !== payment.stripeCheckoutSessionId) return 'review_required'
    const saved = attempt?.parameters as unknown as Stripe.Checkout.SessionCreateParams | undefined
    const expectedAttemptId = saved?.metadata?.checkoutAttemptId === attempt?.id ? attempt?.id : undefined
    const options = { timeout: 8000, maxNetworkRetries: 0 }
    let session: Stripe.Checkout.Session
    if (knownId) session = await stripe.checkout.sessions.retrieve(knownId, {}, options)
    else {
      // Recover only the original durable request, never a replacement or an aged-out key.
      if (!attempt || attempt.retiredAt || !expectedAttemptId || Date.now() - attempt.createdAt.getTime() >= RECOVERY_WINDOW_MS ||
          !['PENDING', 'FAILED'].includes(payment.status) || payment.stripePaymentIntentId || payment.stripeChargeId || payment.stripeTransferId ||
          saved?.metadata?.bookingId !== bookingId || saved.metadata.paymentId !== payment.id || saved.mode !== 'payment' ||
          saved.line_items?.length !== 1 || saved.line_items[0].quantity !== 1 || saved.line_items[0].price_data?.unit_amount !== payment.amountInCents ||
          saved.line_items[0].price_data?.currency !== 'usd' || saved.payment_intent_data?.application_fee_amount !== payment.platformFeeInCents ||
          saved.payment_intent_data?.transfer_data?.destination !== booking.trainerProfile.stripeAccountId) return 'review_required'
      session = await stripe.checkout.sessions.create(saved, { ...options, idempotencyKey: `trainr-checkout-${attempt.id}` })
    }
    const validate = (observed: Stripe.Checkout.Session) => {
      validateSession(observed, bookingId, payment.id, payment.amountInCents, expectedAttemptId)
      if ((knownId && observed.id !== knownId) || (payment.stripePaymentIntentId && objectId(observed.payment_intent) !== payment.stripePaymentIntentId)) throw new CheckoutConflict('Checkout identity changed')
    }
    validate(session)
    // External requests are outside SQL locks; recheck identity before saving recovery.
    await prisma.$transaction(async tx => {
      const current = await lockedBooking(tx, bookingId)
      if (!current?.payment || current.status !== 'CANCELLED' || current.payment.id !== payment.id) throw new CheckoutConflict('Cancellation changed')
      const latest = await tx.checkoutAttempt.findFirst({ where: { paymentId: payment.id }, orderBy: { sequence: 'desc' } })
      if (latest?.id !== attempt?.id || (latest?.stripeCheckoutSessionId && latest.stripeCheckoutSessionId !== session.id) ||
          (current.payment.stripeCheckoutSessionId && current.payment.stripeCheckoutSessionId !== session.id)) throw new CheckoutConflict('Checkout identity changed')
      if (latest) await tx.checkoutAttempt.update({ where: { id: latest.id }, data: { stripeCheckoutSessionId: session.id } })
      await tx.payment.update({ where: { id: payment.id }, data: { stripeCheckoutSessionId: session.id } })
    })
    const sessionId = session.id
    if (session.status === 'open' && session.payment_status === 'unpaid') {
      try { session = await stripe.checkout.sessions.expire(sessionId, {}, { ...options, idempotencyKey: `trainr-cancel-${sessionId}` }) }
      catch { session = await stripe.checkout.sessions.retrieve(sessionId, {}, options) }
      validate(session)
      if (session.id !== sessionId) return 'review_required'
    }
    if (session.payment_status === 'paid') {
      await applyPaymentEvidence({ bookingId, paymentId: payment.id, attemptId: expectedAttemptId, sessionId, intentId: objectId(session.payment_intent),
        amount: session.amount_total, currency: session.currency, outcome: 'paid' })
      return 'review_required'
    }
    if (session.status !== 'expired' || session.payment_status !== 'unpaid' || session.after_expiration?.recovery?.enabled) return 'review_required'
    const intentId = objectId(session.payment_intent)
    if (intentId) {
      const intent = await stripe.paymentIntents.retrieve(intentId, {}, options)
      if (intent.id !== intentId || intent.status !== 'canceled') return 'review_required'
    }
    return await prisma.$transaction(async tx => {
      const latest = await lockedBooking(tx, bookingId)
      const current = latest?.payment
      if (latest?.status !== 'CANCELLED' || !current || current.id !== payment.id || current.stripeCheckoutSessionId !== sessionId ||
          current.amountInCents !== payment.amountInCents || !['PENDING', 'FAILED'].includes(current.status) || current.stripeChargeId || current.stripeTransferId ||
          current.refundAmountInCents > 0 || current.refundPendingAmountInCents > 0 || (current.stripePaymentIntentId && current.stripePaymentIntentId !== intentId)) return 'review_required'
      return 'closed'
    })
  } catch {
    // Booking cancellation remains committed; an unknown provider outcome is not closure.
    return 'review_required'
  }
}

export async function startOrResumeCheckout(bookingId: string, buyer: Buyer, accountId: string) {
  let expired: ExpiredSession | undefined
  for (let pass = 0; pass < 3; pass++) {
    const prepared = await prepare(bookingId, buyer, accountId, expired)
    expired = undefined
    const { payment, attempt } = prepared
    const knownSessionId = prepared.legacySessionId || attempt?.stripeCheckoutSessionId || payment.stripeCheckoutSessionId
    let session: Stripe.Checkout.Session
    if (knownSessionId) {
      session = await stripe.checkout.sessions.retrieve(knownSessionId)
    } else {
      if (!attempt || Date.now() - attempt.createdAt.getTime() >= RECOVERY_WINDOW_MS) {
        throw new CheckoutConflict('Checkout outcome is unknown beyond the safe retry window. Contact support for reconciliation.')
      }
      session = await stripe.checkout.sessions.create(
        attempt.parameters as unknown as Stripe.Checkout.SessionCreateParams,
        { idempotencyKey: `trainr-checkout-${attempt.id}` },
      )
    }
    validateSession(session, bookingId, payment.id, payment.amountInCents, attempt?.id)
    if ((knownSessionId && session.id !== knownSessionId) ||
        (payment.stripePaymentIntentId && objectId(session.payment_intent) !== payment.stripePaymentIntentId)) {
      throw new CheckoutConflict('Stripe session or payment intent requires reconciliation.')
    }
    if (session.payment_status === 'paid') {
      await applyPaymentEvidence({
        bookingId, paymentId: payment.id, attemptId: attempt?.id,
        sessionId: session.id, intentId: objectId(session.payment_intent),
        amount: session.amount_total, currency: session.currency, outcome: 'paid',
      })
    }
    if (session.payment_status === 'paid' || session.status === 'complete') {
      throw new CheckoutConflict('Payment is already processing or completed. Refresh your booking.')
    }
    if (session.status === 'expired' && session.payment_status === 'unpaid') {
      const intentId = objectId(session.payment_intent)
      if (intentId) {
        const intent = await stripe.paymentIntents.retrieve(intentId)
        if (intent.status !== 'canceled') throw new CheckoutConflict('Expired checkout has an unresolved payment intent. Contact support before retrying.')
      }
      // Persist recovered session identity before considering a replacement.
      await rememberSession(bookingId, buyer, accountId, session, attempt?.id || null)
      expired = { id: session.id, intentId }
      continue
    }
    if (session.status !== 'open' || session.payment_status !== 'unpaid' || !session.url) {
      throw new CheckoutConflict('Stripe checkout is not payable. Refresh your booking or contact support.')
    }
    await rememberSession(bookingId, buyer, accountId, session, attempt?.id || null)
    return { checkoutUrl: session.url, paymentId: payment.id }
  }
  throw new CheckoutConflict('Checkout changed repeatedly. Refresh your booking before retrying.')
}
