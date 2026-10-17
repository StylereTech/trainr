import { Prisma } from '@prisma/client'

// Prisma decodes SQL NULL and JSON null alike. Use the reader's existing snapshot.
export async function readPaymentReviewHolds(tx: Prisma.TransactionClient, bookingIds: string[]) {
  if (!bookingIds.length) return new Set<string>()
  const rows = await tx.payment.findMany({ where: {
    bookingId: { in: [...new Set(bookingIds)] }, financialReview: { not: Prisma.DbNull },
  }, select: { bookingId: true } })
  return new Set(rows.map(row => row.bookingId))
}
