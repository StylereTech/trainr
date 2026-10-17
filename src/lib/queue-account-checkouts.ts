import type { Prisma } from '@prisma/client'

// Caller holds the revocation's user/profile locks. Commit work with the access change.
export async function queueAccountCheckouts(tx: Prisma.TransactionClient, userId: string) {
  const participant = { OR: [{ parentProfile: { userId } }, { trainerProfile: { userId } }] }
  const payments = await tx.payment.findMany({ where: { booking: participant }, select: { id: true } })
  const purchases = await tx.packagePurchase.findMany({ where: participant, select: { id: true } })
  for (const [kind, records] of [['BOOKING', payments], ['PACKAGE', purchases]] as const) {
    if (!records.length) continue
    await tx.accountCheckoutClosure.createMany({ data: records.map(({ id }) => ({ userId, kind, targetId: id })), skipDuplicates: true })
    // A reinstated account can have a later session on the same financial record.
    await tx.accountCheckoutClosure.updateMany({ where: { kind, targetId: { in: records.map(record => record.id) } },
      data: { userId, status: 'PENDING', outcome: null, sessionId: null, checkedAt: null } })
  }
}
