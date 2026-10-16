import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { effectiveFeeValues } from '@/lib/fee-config'
import { calculateSplit } from '@/lib/fees'
import { approvedPackageCreditPolicy, packagePurchaseRequestSchema, packagePurchaseTermsSchema } from '@/lib/package-purchase-schema'
import { canonicalTimeZone } from '@/lib/time-zone'

export class PackagePurchaseError extends Error {
  constructor(message: string, public readonly status = 409) { super(message) }
}
export class PackageOfferChangedError extends PackagePurchaseError {}

const catalogInclude = { trainerProfile: { include: { user: { select: { deletedAt: true, role: true } }, sports: true } },
  items: { orderBy: { serviceOfferingId: 'asc' as const }, include: { serviceOffering: { include: { sport: true } } } },
} satisfies Prisma.PackageInclude
type Catalog = Prisma.PackageGetPayload<{ include: typeof catalogInclude }>
function catalogTerms(value: Catalog) {
  const trainer = value.trainerProfile
  if (!value.isActive || !trainer.isActive || trainer.approvalStatus !== 'APPROVED' || trainer.user.deletedAt || trainer.user.role !== 'TRAINER') {
    throw new PackagePurchaseError('This package is not available for purchase.')
  }
  if (value.items.some(({ serviceOffering: service }) => !service.isActive || service.trainerProfileId !== trainer.id ||
      !service.sport?.isActive || !trainer.sports.some(sport => sport.sportId === service.sportId))) {
    throw new PackagePurchaseError('A package service is no longer available.')
  }
  const parsed = packagePurchaseTermsSchema.safeParse({ version: 2, creditPolicy: approvedPackageCreditPolicy,
    title: value.title, description: value.description || '', validForDays: value.validForDays, totalSessions: value.totalSessions,
    items: value.items.map(({ serviceOffering: service, sessionsCount }) => ({ serviceOfferingId: service.id, title: service.title,
      sportId: service.sportId, durationMinutes: service.durationMinutes, type: service.type, sessionsCount })),
  })
  if (!parsed.success) throw new PackagePurchaseError('Package terms require correction before purchase.')
  return parsed.data
}

export async function readPackageOffer(userId: string, packageId: string) {
  return prisma.$transaction(async tx => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true, deletedAt: true, parentProfile: { select: { id: true } } } })
    if (user?.role !== 'PARENT' || user.deletedAt) throw new PackagePurchaseError('Parent access is required', 403)
    if (!user.parentProfile) throw new PackagePurchaseError('Parent profile not found', 404)
    const value = await tx.package.findUnique({ where: { id: packageId }, include: catalogInclude })
    if (!value) throw new PackagePurchaseError('Package not found', 404)
    const terms = catalogTerms(value), fees = await effectiveFeeValues(tx)
    const hold = !canonicalTimeZone(value.trainerProfile.timeZone) ? 'Trainer schedule time zone needs correction before checkout.' :
      value.priceInCents < fees.minBookingAmountCents ? 'Package price is below the platform minimum.' :
      !value.trainerProfile.stripeAccountId || !value.trainerProfile.stripeOnboardingComplete ? 'Trainer must finish Stripe setup before checkout.' : null
    return { buyerId: userId, packageId, purchaseId: null, catalogRevision: value.updatedAt.toISOString(), terms,
      amountInCents: value.priceInCents, trainerName: `${value.trainerProfile.firstName} ${value.trainerProfile.lastName}`.trim(),
      trainerSlug: value.trainerProfile.slug, status: null, hold, canCheckout: !hold, canBuyAgain: false }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
}

// Preparation alone grants no credits and performs no Stripe, booking or wallet writes.
export async function preparePackagePurchase(userId: string, raw: unknown) {
  const { requestId, ...input } = packagePurchaseRequestSchema.parse(raw)
  const payloadHash = createHash('sha256').update(JSON.stringify(input)).digest('hex')
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR SHARE`
    const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true, deletedAt: true } })
    if (user?.role !== 'PARENT' || user.deletedAt) throw new PackagePurchaseError('Parent access is required', 403)
    await tx.$queryRaw`SELECT id FROM parent_profiles WHERE "userId" = ${userId} FOR NO KEY UPDATE`
    const parent = await tx.parentProfile.findUnique({ where: { userId } })
    if (!parent) throw new PackagePurchaseError('Parent profile not found', 404)
    const previous = await tx.packagePurchase.findUnique({ where: { parentProfileId_requestId: { parentProfileId: parent.id, requestId } } })
    if (previous) {
      if (previous.payloadHash !== payloadHash) throw new PackagePurchaseError('Purchase request already used. Review your existing purchase before retrying.')
      return previous
    }
    const reference = await tx.package.findUnique({ where: { id: input.packageId }, select: { trainerProfileId: true } })
    if (!reference) throw new PackagePurchaseError('Package not found', 404)
    // Use the same trainer lock as catalog and service edits, then re-read their committed terms.
    await tx.$queryRaw`SELECT id FROM trainer_profiles WHERE id = ${reference.trainerProfileId} FOR UPDATE`
    const value = await tx.package.findUnique({ where: { id: input.packageId }, include: catalogInclude })
    if (!value || value.trainerProfileId !== reference.trainerProfileId) throw new PackagePurchaseError('Package changed. Reload before purchasing.')
    const trainer = value.trainerProfile, terms = catalogTerms(value)
    if (value.updatedAt.toISOString() !== input.catalogRevision || value.priceInCents !== input.expectedTotalInCents) {
      throw new PackageOfferChangedError('Package terms changed. Review the latest package before purchasing.')
    }
    const fees = await effectiveFeeValues(tx)
    if (value.priceInCents < fees.minBookingAmountCents) throw new PackagePurchaseError('Package price is below the platform minimum.')
    if (!trainer.stripeAccountId || !trainer.stripeOnboardingComplete) {
      throw new PackagePurchaseError('Trainer must finish Stripe setup before checkout.')
    }
    const split = calculateSplit(value.priceInCents, fees.platformCommissionPercent)
    return tx.packagePurchase.create({ data: {
      parentProfileId: parent.id, trainerProfileId: trainer.id, packageId: value.id, requestId, payloadHash,
      catalogRevision: value.updatedAt, terms, amountInCents: value.priceInCents,
      platformFeeInCents: split.platformFee, trainerPayoutInCents: split.trainerShare,
    } })
  })
}
