import { Prisma } from '@prisma/client'
import { createHash } from 'node:crypto'
import type Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'
import { SettlementConflict, verifyDestinationCharge, type SettlementSource } from '@/lib/stripe-settlement'
import { PackagePurchaseError } from '@/lib/package-purchases'
import { assertPackageAttempt, assertPackageSession, packagePaymentIdentity, stripeObjectId } from '@/lib/package-checkout-identity'
import { reconcilePackageRefundHistory } from '@/lib/package-refunds'
import { recordPackageCreditGrants } from '@/lib/package-credit-grants'
import { packagePurchaseTermsSchema } from '@/lib/package-purchase-schema'
import { recordPackagePaymentReceipt, type PackageSuccessEvidence } from '@/lib/package-payment-receipt'

// A paid redirect/event is only a prompt to read current provider receipts, never proof itself.
export async function reconcilePackageCheckout(purchaseId: string, attemptId: string, sessionId: string,
  evidence: { intentId: string; chargeId: string; source: SettlementSource; refunds?: { refundId?: string } } | undefined = undefined,
  actor?: { id: string; role?: string }, successEvidence?: PackageSuccessEvidence) {
  return prisma.$transaction(async tx => {
    const owners = await tx.packagePurchase.findUnique({ where: { id: purchaseId }, select: {
      parentProfile: { select: { userId: true } }, trainerProfile: { select: { userId: true } },
    } })
    if (!owners) throw new PackagePurchaseError('Package purchase not found', 404)
    const accounts = await tx.$queryRaw<Array<{ id: string; role: string; deletedAt: Date | null }>>`
      SELECT id, role, "deletedAt" FROM users
      WHERE id IN (${owners.parentProfile.userId}, ${owners.trainerProfile.userId}, ${actor?.id || ''}) ORDER BY id FOR SHARE`
    if (actor) {
      const current = accounts.find(account => account.id === actor.id)
      if (!current || current.deletedAt || current.role !== actor.role || !['PARENT', 'TRAINER'].includes(current.role)) {
        throw new PackagePurchaseError('Parent or trainer access is required', 403)
      }
    }
    await tx.$queryRaw`SELECT id FROM trainer_profiles WHERE id = (SELECT "trainerProfileId" FROM package_purchases WHERE id = ${purchaseId}) FOR SHARE`
    await tx.$queryRaw`SELECT id FROM package_purchases WHERE id = ${purchaseId} FOR UPDATE`
    if (actor && !await tx.packagePurchase.findFirst({ where: { id: purchaseId,
      ...(actor.role === 'PARENT' ? { parentProfile: { userId: actor.id } } : { trainerProfile: { userId: actor.id } }) }, select: { id: true } })) {
      throw new PackagePurchaseError('Package purchase not found', 404)
    }
    const purchase = await tx.packagePurchase.findUnique({ where: { id: purchaseId } })
    const attempt = await tx.packageCheckoutAttempt.findFirst({ where: { purchaseId }, orderBy: { sequence: 'desc' } })
    if (!purchase || !attempt || attempt.id !== attemptId) throw new PackagePurchaseError('Package checkout attempt does not match the purchase.')
    const trainer = await tx.trainerProfile.findUniqueOrThrow({ where: { id: purchase.trainerProfileId }, include: { sports: true } })
    const parent = await tx.parentProfile.findUniqueOrThrow({ where: { id: purchase.parentProfileId } })
    if (parent.userId !== owners.parentProfile.userId || trainer.userId !== owners.trainerProfile.userId) throw new PackagePurchaseError('Package ownership changed. Retry reconciliation.')
    const terms = packagePurchaseTermsSchema.parse(purchase.terms)
    // Keep fulfillment eligibility stable while provider evidence is read and grants commit.
    await tx.$queryRaw(Prisma.sql`SELECT id FROM service_offerings
      WHERE id IN (${Prisma.join(terms.items.map(item => item.serviceOfferingId).sort())}) ORDER BY id FOR SHARE`)
    await tx.$queryRaw(Prisma.sql`SELECT id FROM sports
      WHERE id IN (${Prisma.join([...new Set(terms.items.map(item => item.sportId))].sort())}) ORDER BY id FOR SHARE`)
    const services = await tx.serviceOffering.findMany({ where: { id: { in: terms.items.map(item => item.serviceOfferingId) } }, include: { sport: true } })
    const retirement = await tx.accountCheckoutClosure.findFirst({ where: { kind: 'PACKAGE', targetId: purchaseId, status: { not: 'CLOSED' } } })
    const fulfillmentReview = [
      ...(retirement ? ['checkout_retirement_pending'] : []),
      ...(!accounts.some(account => account.id === parent.userId && account.role === 'PARENT' && !account.deletedAt) ? ['parent_account_unavailable'] : []),
      ...(!accounts.some(account => account.id === trainer.userId && account.role === 'TRAINER' && !account.deletedAt) || !trainer.isActive || trainer.approvalStatus !== 'APPROVED' ? ['trainer_unavailable'] : []),
      ...(terms.items.some(item => { const service = services.find(value => value.id === item.serviceOfferingId)
        return !service?.isActive || service.trainerProfileId !== trainer.id || !service.sport?.isActive || service.sportId !== item.sportId ||
          service.durationMinutes !== item.durationMinutes || service.type !== item.type || !trainer.sports.some(value => value.sportId === item.sportId)
      }) ? ['purchased_service_unavailable'] : []),
    ]
    assertPackageAttempt(purchase, attempt)
    const session = await stripe.checkout.sessions.retrieve(sessionId, {}, { timeout: 4000, maxNetworkRetries: 0 })
    if (session.id !== sessionId) throw new PackagePurchaseError('Package checkout session identity changed.')
    assertPackageSession(purchase, attempt, session)
    const intentId = stripeObjectId(session.payment_intent)
    if (actor && ['open', 'expired'].includes(session.status || '') && session.payment_status === 'unpaid' &&
        ['PENDING', 'FAILED'].includes(purchase.status) && !purchase.settlementVerifiedAt && !purchase.stripeChargeId && !purchase.stripeTransferId &&
        !purchase.refundAmountInCents && !purchase.refundPendingAmountInCents && !purchase.refundFailedCount && !purchase.financialReview) return purchase
    if (session.status !== 'complete' || session.payment_status !== 'paid' || !intentId) throw new PackagePurchaseError('Package payment is not completed.')
    if (evidence && evidence.intentId !== intentId) throw new PackagePurchaseError('Package financial event intent does not match checkout.')
    const settlement = await verifyDestinationCharge(purchase, attempt, packagePaymentIdentity(purchase.id, attempt.id),
      intentId, evidence?.chargeId, evidence?.source, session.livemode)
    const refunds = evidence?.refunds || actor ? await reconcilePackageRefundHistory(tx, purchase, intentId, settlement.chargeId, settlement.hasRefunds, evidence?.refunds?.refundId) : null
    const refundState = refunds || purchase
    // A normal paid/transfer replay must not clear unresolved refund evidence.
    const details = { ...settlement.review?.details, ...(fulfillmentReview.length ? { fulfillmentReview } : {}), packageRefunds: { refundedInCents: refundState.refundAmountInCents,
      pendingInCents: refundState.refundPendingAmountInCents, failedCount: refundState.refundFailedCount } }
    const review = fulfillmentReview.length || refundState.refundAmountInCents || refundState.refundPendingAmountInCents || refundState.refundFailedCount
      ? { key: createHash('sha256').update(JSON.stringify(details)).digest('hex'), details } : settlement.review
    await tx.packageCheckoutAttempt.update({ where: { id: attempt.id }, data: { stripeCheckoutSessionId: session.id } })
    const updated = await tx.packagePurchase.update({ where: { id: purchase.id }, data: {
      stripeCheckoutSessionId: session.id, stripePaymentIntentId: intentId, stripeChargeId: settlement.chargeId, stripeTransferId: settlement.transferId,
      status: ['REFUNDED', 'PARTIALLY_REFUNDED'].includes(purchase.status) ? purchase.status : 'SUCCEEDED',
      settlementVerifiedAt: new Date(), financialReview: review ? JSON.parse(JSON.stringify(review)) : Prisma.DbNull,
      ...(refunds || {}),
    } })
    if (successEvidence) await recordPackagePaymentReceipt(tx, updated, successEvidence, session.livemode)
    await recordPackageCreditGrants(tx, updated)
    return updated
  }, { maxWait: 5000, timeout: actor ? 90000 : evidence?.refunds ? 45000 : 30000 })
}

// The signed PaymentIntent success event is the validity anchor. Checkout redirects,
// charge creation, delayed refreshes and grant issuance do not establish payment time.
export async function reconcilePackagePaymentSuccess(event: Stripe.Event) {
  if (event.account || event.type !== 'payment_intent.succeeded') throw new PackagePurchaseError('Platform payment success event required.')
  const intent = event.data.object as Stripe.PaymentIntent
  const metadata = intent.metadata
  if (metadata?.paymentKind !== 'package' || !metadata.packagePurchaseId || !metadata.packageCheckoutAttemptId ||
      metadata.bookingId || metadata.paymentId || metadata.checkoutAttemptId || intent.status !== 'succeeded' ||
      intent.livemode !== event.livemode || intent.amount !== intent.amount_received) {
    throw new PackagePurchaseError('Package payment success identity is ambiguous.')
  }
  const attempt = await prisma.packageCheckoutAttempt.findUnique({ where: { id: metadata.packageCheckoutAttemptId } })
  if (!attempt || attempt.purchaseId !== metadata.packagePurchaseId || attempt.retiredAt) throw new PackagePurchaseError('Package payment success attempt does not match.')
  if (!attempt.stripeCheckoutSessionId) throw new Error('Package checkout session is not attached yet; retry required')
  const chargeId = stripeObjectId(intent.latest_charge)
  if (!chargeId) throw new PackagePurchaseError('Package payment success charge is missing.')
  return reconcilePackageCheckout(attempt.purchaseId, attempt.id, attempt.stripeCheckoutSessionId,
    { intentId: intent.id, chargeId, source: {} }, undefined,
    { eventId: event.id, created: event.created, livemode: event.livemode, intentId: intent.id, chargeId,
      amountInCents: intent.amount_received, currency: intent.currency as 'usd' })
}

export async function reconcilePackageCharge(charge: Stripe.Charge, source: SettlementSource, hasBookingMatches: boolean, refunds?: { refundId?: string }) {
  const chargeId = charge.id, intentId = stripeObjectId(charge.payment_intent)
  const matches = await prisma.packagePurchase.findMany({ where: { OR: [
    { stripeChargeId: chargeId }, ...(intentId ? [{ stripePaymentIntentId: intentId }] : []),
    ...(source.transferId ? [{ stripeTransferId: source.transferId }] : []),
    ...(charge.metadata?.packagePurchaseId ? [{ id: charge.metadata.packagePurchaseId }] : []),
  ] }, select: { id: true }, take: 2 })
  const packageMetadata = charge.metadata?.paymentKind === 'package' || charge.metadata?.packagePurchaseId || charge.metadata?.packageCheckoutAttemptId
  if (!matches.length && !packageMetadata) return false
  if (hasBookingMatches || matches.length !== 1 || !intentId || charge.metadata?.paymentKind !== 'package' ||
      charge.metadata.packagePurchaseId !== matches[0].id || !charge.metadata.packageCheckoutAttemptId ||
      charge.metadata.bookingId || charge.metadata.paymentId || charge.metadata.checkoutAttemptId) {
    throw new SettlementConflict('Package financial event does not map to one unambiguous purchase')
  }
  const attempt = await prisma.packageCheckoutAttempt.findUnique({ where: { id: charge.metadata.packageCheckoutAttemptId } })
  if (!attempt || attempt.purchaseId !== matches[0].id || attempt.retiredAt) throw new SettlementConflict('Package financial event checkout attempt does not match')
  // Provider events can precede local attachment; retry rather than losing the event.
  if (!attempt.stripeCheckoutSessionId) throw new Error('Package checkout session is not attached yet; retry required')
  await reconcilePackageCheckout(matches[0].id, attempt.id, attempt.stripeCheckoutSessionId, { intentId, chargeId, source, refunds })
  return true
}
