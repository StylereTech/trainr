import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { effectiveFeeValues } from '@/lib/fee-config'
import { calculateSplit } from '@/lib/fees'
import { approvedPackageCreditPolicy, packagePurchaseRequestSchema, packagePurchaseTermsSchema } from '@/lib/package-purchase-schema'

export class PackagePurchaseError extends Error {
  constructor(message: string, public readonly status = 409) { super(message) }
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
    const value = await tx.package.findUnique({ where: { id: input.packageId }, include: {
      trainerProfile: { include: { user: { select: { deletedAt: true, role: true } }, sports: true } },
      items: { orderBy: { serviceOfferingId: 'asc' }, include: { serviceOffering: { include: { sport: true } } } },
    } })
    if (!value || value.trainerProfileId !== reference.trainerProfileId) throw new PackagePurchaseError('Package changed. Reload before purchasing.')
    const trainer = value.trainerProfile
    if (!value.isActive || !trainer.isActive || trainer.approvalStatus !== 'APPROVED' || trainer.user.deletedAt || trainer.user.role !== 'TRAINER') {
      throw new PackagePurchaseError('This package is not available for purchase.')
    }
    if (value.updatedAt.toISOString() !== input.catalogRevision || value.priceInCents !== input.expectedTotalInCents) {
      throw new PackagePurchaseError('Package terms changed. Review the latest package before purchasing.')
    }
    if (value.items.some(({ serviceOffering: service }) => !service.isActive || service.trainerProfileId !== trainer.id ||
        !service.sport?.isActive || !trainer.sports.some(sport => sport.sportId === service.sportId))) {
      throw new PackagePurchaseError('A package service is no longer available.')
    }
    const parsed = packagePurchaseTermsSchema.safeParse({
      version: 2, creditPolicy: approvedPackageCreditPolicy,
      title: value.title, description: value.description || '', validForDays: value.validForDays, totalSessions: value.totalSessions,
      items: value.items.map(({ serviceOffering: service, sessionsCount }) => ({
        serviceOfferingId: service.id, title: service.title, sportId: service.sportId,
        durationMinutes: service.durationMinutes, type: service.type, sessionsCount,
      })),
    })
    if (!parsed.success) throw new PackagePurchaseError('Package terms require correction before purchase.')
    const fees = await effectiveFeeValues(tx)
    if (value.priceInCents < fees.minBookingAmountCents) throw new PackagePurchaseError('Package price is below the platform minimum.')
    const split = calculateSplit(value.priceInCents, fees.platformCommissionPercent)
    return tx.packagePurchase.create({ data: {
      parentProfileId: parent.id, trainerProfileId: trainer.id, packageId: value.id, requestId, payloadHash,
      catalogRevision: value.updatedAt, terms: parsed.data, amountInCents: value.priceInCents,
      platformFeeInCents: split.platformFee, trainerPayoutInCents: split.trainerShare,
    } })
  })
}
