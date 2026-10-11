import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import type Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'
import { toAbsoluteAppUrl } from '@/lib/app-url'
import { refreshConnectReadiness } from '@/lib/connect-readiness'
import { isStripeAccountReady } from '@/lib/stripe-account'
import { PackagePurchaseError } from '@/lib/package-purchases'
import { packagePurchaseTermsSchema } from '@/lib/package-purchase-schema'
import { assertPackageAttempt, assertPackageSession, packagePaymentIdentity, stripeObjectId } from '@/lib/package-checkout-identity'
import { reconcilePackageCheckout } from '@/lib/package-settlement'

const RECOVERY_WINDOW_MS = 23 * 60 * 60 * 1000
const options = { timeout: 8000, maxNetworkRetries: 0 }
type Expired = { sessionId: string; intentId: string | null; attemptId: string }

async function lockedPurchase(tx: Prisma.TransactionClient, purchaseId: string, userId: string) {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR SHARE`
  const user = await tx.user.findUnique({ where: { id: userId }, select: { email: true, deletedAt: true, role: true } })
  await tx.$queryRaw`SELECT id FROM package_purchases WHERE id = ${purchaseId} FOR UPDATE`
  await tx.$queryRaw`SELECT id FROM trainer_profiles WHERE id = (SELECT "trainerProfileId" FROM package_purchases WHERE id = ${purchaseId}) FOR SHARE`
  const purchase = await tx.packagePurchase.findUnique({ where: { id: purchaseId }, include: {
    parentProfile: true, package: true, trainerProfile: { include: { sports: true, user: { select: { role: true, deletedAt: true } } } },
  } })
  if (!purchase || purchase.parentProfile.userId !== userId) throw new PackagePurchaseError('Package purchase not found', 404)
  const terms = packagePurchaseTermsSchema.parse(purchase.terms)
  const services = await tx.serviceOffering.findMany({ where: { id: { in: terms.items.map(item => item.serviceOfferingId) } }, include: { sport: true } })
  return { purchase, user, terms, services }
}
type Snapshot = Awaited<ReturnType<typeof lockedPurchase>>

function assertPayable({ purchase, user, terms, services }: Snapshot, accountId?: string) {
  if (user?.role !== 'PARENT' || user.deletedAt) throw new PackagePurchaseError('Parent access is required', 403)
  const trainer = purchase.trainerProfile
  if (!trainer.isActive || trainer.approvalStatus !== 'APPROVED' || trainer.user.deletedAt || trainer.user.role !== 'TRAINER') {
    throw new PackagePurchaseError('Trainer is not available for package checkout.')
  }
  if (!trainer.stripeAccountId || (accountId && trainer.stripeAccountId !== accountId)) throw new PackagePurchaseError('Trainer payment account needs reconnection.')
  if (!['PENDING', 'FAILED'].includes(purchase.status) || purchase.stripeChargeId || purchase.stripeTransferId || purchase.settlementVerifiedAt || purchase.financialReview) {
    throw new PackagePurchaseError('Package purchase already has financial activity. Review it before paying again.')
  }
  if (!purchase.package.isActive || purchase.package.updatedAt.getTime() !== purchase.catalogRevision.getTime() ||
      services.length !== terms.items.length || terms.items.some(item => {
        const service = services.find(value => value.id === item.serviceOfferingId)
        return !service?.isActive || service.trainerProfileId !== trainer.id || !service.sport?.isActive ||
          !trainer.sports.some(sport => sport.sportId === service.sportId) || service.sportId !== item.sportId ||
          service.durationMinutes !== item.durationMinutes || service.type !== item.type
      })) {
    throw new PackagePurchaseError('Package terms or services changed. Review the latest offer before paying.')
  }
  if (!Number.isSafeInteger(purchase.amountInCents) || purchase.amountInCents < 50 || purchase.amountInCents > 99999999 ||
      !Number.isSafeInteger(purchase.platformFeeInCents) || !Number.isSafeInteger(purchase.trainerPayoutInCents) ||
      purchase.platformFeeInCents < 0 || purchase.trainerPayoutInCents < 0 || purchase.platformFeeInCents + purchase.trainerPayoutInCents !== purchase.amountInCents) {
    throw new PackagePurchaseError('Package purchase amounts require reconciliation.')
  }
}

async function prepare(purchaseId: string, userId: string, accountId: string, expired?: Expired) {
  return prisma.$transaction(async tx => {
    const snapshot = await lockedPurchase(tx, purchaseId, userId)
    assertPayable(snapshot, accountId)
    let purchase = snapshot.purchase
    const latest = await tx.packageCheckoutAttempt.findFirst({ where: { purchaseId }, orderBy: { sequence: 'desc' } })
    if (expired && latest?.id === expired.attemptId && latest.stripeCheckoutSessionId === expired.sessionId && !latest.retiredAt) {
      if (purchase.stripeCheckoutSessionId !== expired.sessionId || (purchase.stripePaymentIntentId && purchase.stripePaymentIntentId !== expired.intentId)) {
        throw new PackagePurchaseError('Previous package payment requires reconciliation.')
      }
      await tx.packageCheckoutAttempt.update({ where: { id: latest.id }, data: { retiredAt: new Date() } })
      purchase = { ...purchase, ...await tx.packagePurchase.update({ where: { id: purchaseId }, data: { stripeCheckoutSessionId: null, stripePaymentIntentId: null, status: 'PENDING' } }) }
    } else if (latest && !latest.retiredAt) {
      assertPackageAttempt(purchase, latest, accountId)
      return { purchase, attempt: latest }
    } else if (purchase.stripeCheckoutSessionId || purchase.stripePaymentIntentId) {
      throw new PackagePurchaseError('Unlinked package payment requires reconciliation.')
    }
    const terms = packagePurchaseTermsSchema.parse(purchase.terms), id = randomUUID()
    const metadata = packagePaymentIdentity(purchase.id, id)
    const parameters: Stripe.Checkout.SessionCreateParams = {
      mode: 'payment', payment_method_types: ['card'], customer_email: snapshot.user!.email,
      expires_at: Math.floor((Date.now() + RECOVERY_WINDOW_MS) / 1000), metadata,
      line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: purchase.amountInCents,
        product_data: { name: terms.title, description: `${terms.totalSessions} sessions shared across your children` } } }],
      payment_intent_data: { application_fee_amount: purchase.platformFeeInCents, transfer_data: { destination: accountId }, metadata },
      success_url: toAbsoluteAppUrl('/parent/dashboard?packagePayment=success'),
      cancel_url: toAbsoluteAppUrl('/parent/dashboard?packagePayment=cancelled'),
    }
    const attempt = await tx.packageCheckoutAttempt.create({ data: { id, purchaseId, sequence: (latest?.sequence || 0) + 1,
      parameters: JSON.parse(JSON.stringify(parameters)) as Prisma.InputJsonObject } })
    return { purchase, attempt }
  })
}

async function remember(purchaseId: string, userId: string, accountId: string, attemptId: string, session: Stripe.Checkout.Session) {
  const error = await prisma.$transaction(async tx => {
    const snapshot = await lockedPurchase(tx, purchaseId, userId)
    const { purchase } = snapshot
    const attempt = await tx.packageCheckoutAttempt.findFirst({ where: { purchaseId }, orderBy: { sequence: 'desc' } })
    if (!attempt || attempt.id !== attemptId) throw new PackagePurchaseError('Package checkout attempt changed.')
    const saved = assertPackageAttempt(purchase, attempt, accountId)
    assertPackageSession(purchase, attempt, session)
    await tx.packageCheckoutAttempt.update({ where: { id: attemptId }, data: { stripeCheckoutSessionId: session.id } })
    await tx.packagePurchase.update({ where: { id: purchaseId }, data: {
      stripeCheckoutSessionId: session.id, ...(stripeObjectId(session.payment_intent) ? { stripePaymentIntentId: stripeObjectId(session.payment_intent) } : {}),
    } })
    // Retain provider identity even if account revocation won the external-call race.
    try {
      assertPayable(snapshot, accountId)
      if (session.after_expiration?.recovery?.enabled || (session.status === 'open' && (!Number.isSafeInteger(session.expires_at) ||
          session.expires_at !== saved.expires_at || session.expires_at * 1000 <= Date.now()))) throw new PackagePurchaseError('Package checkout expiry requires reconciliation.')
    } catch (error) { return error as Error }
    return null
  })
  if (error) {
    if (session.status === 'open' && session.payment_status === 'unpaid') {
      try { await stripe.checkout.sessions.expire(session.id, {}, { ...options, idempotencyKey: `trainr-package-withheld-${session.id}` }) }
      catch { console.error('Withheld package checkout expiry requires reconciliation') }
    }
    throw error
  }
}

export async function startOrResumePackageCheckout(purchaseId: string, userId: string) {
  const snapshot = await prisma.$transaction(tx => lockedPurchase(tx, purchaseId, userId))
  assertPayable(snapshot)
  const accountId = snapshot.purchase.trainerProfile.stripeAccountId!
  const account = await refreshConnectReadiness(accountId)
  if (!account || !isStripeAccountReady(account)) throw new PackagePurchaseError('Trainer must finish Stripe setup before package checkout.')
  let expired: Expired | undefined
  for (let pass = 0; pass < 3; pass++) {
    const { purchase, attempt } = await prepare(purchaseId, userId, accountId, expired)
    expired = undefined
    const sessionId = attempt.stripeCheckoutSessionId || purchase.stripeCheckoutSessionId
    if (!sessionId && Date.now() - attempt.createdAt.getTime() >= RECOVERY_WINDOW_MS) {
      throw new PackagePurchaseError('Package checkout outcome is unknown beyond the safe retry window. Contact support.')
    }
    const session = sessionId ? await stripe.checkout.sessions.retrieve(sessionId, {}, options) :
      await stripe.checkout.sessions.create(attempt.parameters as unknown as Stripe.Checkout.SessionCreateParams,
        { ...options, idempotencyKey: `trainr-package-checkout-${attempt.id}` })
    assertPackageSession(purchase, attempt, session)
    if (sessionId && session.id !== sessionId) throw new PackagePurchaseError('Package checkout session changed.')
    if (session.payment_status === 'paid') {
      await reconcilePackageCheckout(purchaseId, attempt.id, session.id)
      throw new PackagePurchaseError('Package payment is already completed. Refresh your purchase.')
    }
    if (session.status === 'expired' && session.payment_status === 'unpaid') {
      const intentId = stripeObjectId(session.payment_intent)
      if (intentId) {
        const intent = await stripe.paymentIntents.retrieve(intentId, {}, options)
        if (intent.id !== intentId || intent.status !== 'canceled') throw new PackagePurchaseError('Expired package checkout has an unresolved payment intent.')
      }
      await remember(purchaseId, userId, accountId, attempt.id, session)
      expired = { sessionId: session.id, intentId, attemptId: attempt.id }
      continue
    }
    if (session.status !== 'open' || session.payment_status !== 'unpaid' || !session.url) throw new PackagePurchaseError('Package payment is processing or not payable.')
    const url = new URL(session.url)
    if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com' || url.username || url.password || url.port) throw new PackagePurchaseError('Stripe checkout address is invalid.')
    await remember(purchaseId, userId, accountId, attempt.id, session)
    return { purchaseId, checkoutUrl: session.url }
  }
  throw new PackagePurchaseError('Package checkout changed repeatedly. Refresh before retrying.')
}
