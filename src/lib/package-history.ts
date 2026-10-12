import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { PackagePurchaseError } from '@/lib/package-purchases'
import { packagePurchaseTermsSchema } from '@/lib/package-purchase-schema'
import { packageHistoryQuery, type PackageHistoryQuery } from '@/lib/package-history-schema'
import { reconcilePackageCheckout } from '@/lib/package-settlement'
import { packageValidity } from '@/lib/package-validity'

export type PackageHistoryActor = { id: string; role?: string }

export async function packageHistoryScope(tx: Prisma.TransactionClient, actor: PackageHistoryActor) {
  const user = await tx.user.findUnique({ where: { id: actor.id }, select: { role: true, deletedAt: true } })
  if (!user || user.deletedAt || user.role !== actor.role || !['PARENT', 'TRAINER'].includes(user.role)) {
    throw new PackagePurchaseError('Parent or trainer access is required', 403)
  }
  const profile = user.role === 'PARENT' ? await tx.parentProfile.findUnique({ where: { userId: actor.id }, select: { id: true } }) :
    await tx.trainerProfile.findUnique({ where: { userId: actor.id }, select: { id: true } })
  if (!profile) throw new PackagePurchaseError('Profile not found', 404)
  return user.role === 'PARENT' ? { parentProfileId: profile.id } : { trainerProfileId: profile.id }
}

export async function readPackageHistory(actor: PackageHistoryActor, raw: PackageHistoryQuery) {
  const { view, page: requestedPage, limit } = packageHistoryQuery.parse(raw)
  return prisma.$transaction(async tx => {
    const scope = await packageHistoryScope(tx, actor)
    const filter: Prisma.PackagePurchaseWhereInput = view === 'pending' ? { status: { in: ['PENDING', 'PROCESSING', 'FAILED'] } } :
      view === 'paid' ? { status: 'SUCCEEDED' } : view === 'refunded' ? { status: { in: ['REFUNDED', 'PARTIALLY_REFUNDED'] } } :
      view === 'review' ? { OR: [{ financialReview: { not: Prisma.AnyNull } }, { refundPendingAmountInCents: { gt: 0 } }, { refundFailedCount: { gt: 0 } }] } : {}
    const where = { ...scope, ...filter }
    const total = await tx.packagePurchase.count({ where }), totalPages = Math.ceil(total / limit)
    const page = Math.min(requestedPage, Math.max(1, totalPages))
    const rows = await tx.packagePurchase.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * limit, take: limit,
      include: { trainerProfile: { select: { firstName: true, lastName: true } }, parentProfile: { select: { user: { select: { email: true } } } },
        creditGrants: { select: { sessionsCount: true } },
        paymentReceipt: { select: { paidAt: true } },
        checkoutAttempts: { orderBy: { sequence: 'desc' }, take: 1, select: { stripeCheckoutSessionId: true, retiredAt: true } } } })
    return { purchases: rows.map(row => {
      const terms = packagePurchaseTermsSchema.parse(row.terms)
      const attempt = row.checkoutAttempts[0]
      const validity = packageValidity(terms, row.paymentReceipt?.paidAt || null)
      return { id: row.id, title: terms.title, counterparty: actor.role === 'PARENT' ? `${row.trainerProfile.firstName} ${row.trainerProfile.lastName}`.trim() : row.parentProfile.user.email,
        creditsGranted: row.creditGrants.reduce((sum, grant) => sum + grant.sessionsCount, 0),
        createdAt: row.createdAt.toISOString(), totalSessions: terms.totalSessions, validForDays: terms.validForDays,
        paymentSucceededAt: row.paymentReceipt?.paidAt.toISOString() || null, expiresAt: validity?.expiresAt.toISOString() || null,
        items: terms.items.map(({ title, sessionsCount, durationMinutes }) => ({ title, sessionsCount, durationMinutes })),
        amountInCents: row.amountInCents, trainerAllocationInCents: actor.role === 'TRAINER' ? row.trainerPayoutInCents : null, status: row.status,
        paymentVerified: Boolean(row.settlementVerifiedAt && row.stripePaymentIntentId && row.stripeChargeId && row.stripeTransferId),
        reviewRequired: Boolean(row.financialReview || row.refundPendingAmountInCents || row.refundFailedCount),
        canRefresh: Boolean(attempt?.stripeCheckoutSessionId && !attempt.retiredAt), settlementVerifiedAt: row.settlementVerifiedAt?.toISOString() || null,
        refundAmountInCents: row.refundAmountInCents, refundPendingAmountInCents: row.refundPendingAmountInCents,
        refundFailedCount: row.refundFailedCount, refundsVerifiedAt: row.refundsVerifiedAt?.toISOString() || null }
    }), pagination: { page, limit, total, totalPages } }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
}

export async function refreshPackageHistory(actor: PackageHistoryActor, purchaseId: string) {
  const attempt = await prisma.$transaction(async tx => {
    const scope = await packageHistoryScope(tx, actor)
    const purchase = await tx.packagePurchase.findFirst({ where: { id: purchaseId, ...scope }, select: { id: true } })
    if (!purchase) throw new PackagePurchaseError('Package purchase not found', 404)
    return tx.packageCheckoutAttempt.findFirst({ where: { purchaseId }, orderBy: { sequence: 'desc' } })
  })
  if (!attempt?.stripeCheckoutSessionId || attempt.retiredAt) throw new PackagePurchaseError('Saved package checkout requires support review.')
  await reconcilePackageCheckout(purchaseId, attempt.id, attempt.stripeCheckoutSessionId, undefined, actor)
  return { refreshed: true as const, purchaseId }
}
