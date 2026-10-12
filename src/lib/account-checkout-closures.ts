import type { Prisma } from '@prisma/client'
import type Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'
import { stripeObjectId, assertPackageSession } from '@/lib/package-checkout-identity'

export class CheckoutClosureAccessError extends Error {}
const providerOptions = { timeout: 4000, maxNetworkRetries: 0 }

async function administrator(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${id} FOR SHARE`
  const user = await tx.user.findUnique({ where: { id }, select: { role: true, deletedAt: true } })
  if (user?.role !== 'ADMIN' || user.deletedAt) throw new CheckoutClosureAccessError('Administrator access is required')
}

export async function readAccountCheckoutClosures(adminId: string, page: number) {
  return prisma.$transaction(async tx => {
    await administrator(tx, adminId)
    const total = await tx.accountCheckoutClosure.count()
    const current = Math.min(page, Math.max(1, Math.ceil(total / 20)))
    const rows = await tx.accountCheckoutClosure.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (current - 1) * 20, take: 20,
      select: { id: true, kind: true, targetId: true, userId: true, status: true, outcome: true, checkedAt: true, createdAt: true } })
    return { rows, page: current, total, totalPages: Math.ceil(total / 20) }
  }, { isolationLevel: 'RepeatableRead' })
}

// No replacement checkout, charge, cancellation, refund or payout is created here.
export async function processAccountCheckoutClosure(id: string, authority: { adminId: string } | { closedUserId: string }) {
  return prisma.$transaction(async tx => {
    if ('adminId' in authority) await administrator(tx, authority.adminId)
    const reference = await tx.accountCheckoutClosure.findUnique({ where: { id } })
    if (!reference || ('closedUserId' in authority && reference.userId !== authority.closedUserId)) {
      throw new CheckoutClosureAccessError('Account checkout not found')
    }
    // Same profile -> financial record -> queue order as checkout preparation/revocation.
    if (reference.kind === 'BOOKING') {
      await tx.$queryRaw`SELECT id FROM trainer_profiles WHERE id = (SELECT b."trainerProfileId" FROM bookings b JOIN payments p ON p."bookingId" = b.id WHERE p.id = ${reference.targetId}) FOR SHARE`
      await tx.$queryRaw`SELECT id FROM payments WHERE id = ${reference.targetId} FOR UPDATE`
    } else {
      await tx.$queryRaw`SELECT id FROM trainer_profiles WHERE id = (SELECT "trainerProfileId" FROM package_purchases WHERE id = ${reference.targetId}) FOR SHARE`
      await tx.$queryRaw`SELECT id FROM package_purchases WHERE id = ${reference.targetId} FOR UPDATE`
    }
    await tx.$queryRaw`SELECT id FROM account_checkout_closures WHERE id = ${id} FOR UPDATE`
    const task = await tx.accountCheckoutClosure.findUnique({ where: { id } })
    if (!task || task.kind !== reference.kind || task.targetId !== reference.targetId || ('closedUserId' in authority && task.userId !== authority.closedUserId)) {
      throw new CheckoutClosureAccessError('Account checkout not found')
    }
    if (task.status === 'CLOSED') return { id, status: task.status, outcome: task.outcome }
    let outcome = 'provider_unavailable', sessionId: string | null = null
    try {
      let knownId: string | null, intentId: string | null, financialActivity: boolean
      let validate: (session: Stripe.Checkout.Session) => void
      if (task.kind === 'BOOKING') {
        const payment = await tx.payment.findUniqueOrThrow({ where: { id: task.targetId }, include: {
          booking: { include: { parentProfile: true, trainerProfile: true } }, checkoutAttempts: { orderBy: { sequence: 'desc' }, take: 1 },
        } })
        const attempt = payment.checkoutAttempts[0], booking = payment.booking
        if (![booking.parentProfile.userId, booking.trainerProfile.userId].includes(task.userId)) throw new Error('identity')
        knownId = attempt?.stripeCheckoutSessionId || payment.stripeCheckoutSessionId
        intentId = payment.stripePaymentIntentId
        if (attempt?.stripeCheckoutSessionId && payment.stripeCheckoutSessionId && attempt.stripeCheckoutSessionId !== payment.stripeCheckoutSessionId) throw new Error('identity')
        financialActivity = !['PENDING', 'FAILED'].includes(payment.status) || !!(payment.stripeChargeId || payment.stripeTransferId || payment.settlementVerifiedAt ||
          payment.financialReview || payment.refundAmountInCents || payment.refundPendingAmountInCents || payment.refundFailedCount)
        validate = session => {
          if (session.metadata?.bookingId !== booking.id || session.metadata?.paymentId !== payment.id ||
              (attempt && session.metadata?.checkoutAttemptId !== attempt.id) || session.metadata?.packagePurchaseId ||
              session.amount_total !== payment.amountInCents) throw new Error('identity')
        }
      } else {
        const purchase = await tx.packagePurchase.findUniqueOrThrow({ where: { id: task.targetId }, include: {
          parentProfile: true, trainerProfile: true, checkoutAttempts: { orderBy: { sequence: 'desc' }, take: 1 },
        } })
        if (![purchase.parentProfile.userId, purchase.trainerProfile.userId].includes(task.userId)) throw new Error('identity')
        const attempt = purchase.checkoutAttempts[0]
        knownId = attempt?.stripeCheckoutSessionId || purchase.stripeCheckoutSessionId
        intentId = purchase.stripePaymentIntentId
        financialActivity = !['PENDING', 'FAILED'].includes(purchase.status) || !!(purchase.stripeChargeId || purchase.stripeTransferId || purchase.settlementVerifiedAt ||
          purchase.financialReview || purchase.refundAmountInCents || purchase.refundPendingAmountInCents || purchase.refundFailedCount)
        validate = session => { if (!attempt) throw new Error('identity'); assertPackageSession(purchase, attempt, session) }
      }
      if (!knownId) outcome = 'missing_session_identity'
      else {
        let session = await stripe.checkout.sessions.retrieve(knownId, {}, providerOptions)
        const verify = (value: Stripe.Checkout.Session) => {
          validate(value)
          if (value.id !== knownId || value.mode !== 'payment' || value.currency !== 'usd' || typeof value.livemode !== 'boolean' ||
              value.recovered_from || value.after_expiration?.recovery?.enabled || (intentId && stripeObjectId(value.payment_intent) !== intentId)) throw new Error('identity')
        }
        verify(session)
        sessionId = session.id
        if (session.status === 'open' && session.payment_status === 'unpaid') {
          try { session = await stripe.checkout.sessions.expire(knownId, {}, { ...providerOptions, idempotencyKey: `trainr-account-close-${knownId}` }) }
          catch { session = await stripe.checkout.sessions.retrieve(knownId, {}, providerOptions) }
          verify(session)
        }
        outcome = 'payment_review_required'
        if (session.status === 'expired' && session.payment_status === 'unpaid' && !financialActivity) {
          const linkedIntent = stripeObjectId(session.payment_intent)
          if (!linkedIntent) outcome = 'expired_unpaid'
          else {
            const intent = await stripe.paymentIntents.retrieve(linkedIntent, {}, providerOptions)
            if (intent.id === linkedIntent && intent.status === 'canceled') outcome = 'expired_unpaid'
          }
        }
      }
    } catch (error) {
      // Persist a bounded diagnostic, never provider error text or customer information.
      outcome = error instanceof Error && error.message === 'identity' ? 'identity_review_required' : 'provider_or_identity_unverified'
    }
    const status = outcome === 'expired_unpaid' ? 'CLOSED' : 'REVIEW'
    await tx.accountCheckoutClosure.update({ where: { id }, data: { status, outcome, sessionId, checkedAt: new Date() } })
    if ('adminId' in authority) await tx.adminAction.create({ data: { adminUserId: authority.adminId, actionType: 'CLOSE_ACCOUNT_CHECKOUT',
      targetType: 'ACCOUNT_CHECKOUT_CLOSURE', targetId: id, description: 'Checked account checkout closure; no refund or payout', metadata: { status, outcome } } })
    return { id, status, outcome }
  }, { maxWait: 5000, timeout: 30000 })
}

export async function processInitialAccountCheckouts(userId: string) {
  try {
    // Bound request latency. Every remaining item stays durable and visible to administrators.
    const tasks = await prisma.accountCheckoutClosure.findMany({ where: { userId, status: 'PENDING' }, orderBy: { id: 'asc' }, take: 1, select: { id: true } })
    for (const task of tasks) await processAccountCheckoutClosure(task.id, { closedUserId: userId })
  } catch { console.error('Account checkout closure remains queued for administrator review') }
}
