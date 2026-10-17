import { Prisma } from '@prisma/client'

// Prisma decodes SQL NULL and JSON null identically; query SQL presence instead.
// Call in the same read snapshot or under the purchase lock as the funded record.
export async function readPackageReviewHolds(tx: Prisma.TransactionClient, purchaseIds: string[]) {
  if (!purchaseIds.length) return new Set<string>()
  const rows = await tx.packagePurchase.findMany({ where: {
    id: { in: [...new Set(purchaseIds)] }, financialReview: { not: Prisma.DbNull },
  }, select: { id: true } })
  return new Set(rows.map(row => row.id))
}
