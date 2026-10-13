import { Prisma } from '@prisma/client'
import { creditRestorationReason } from '@/lib/package-credit-policy'

export class PackageCreditError extends Error {
  constructor(message: string, public readonly status = 409) { super(message) }
}

// Transaction-only primitives. No public route enables redemption until booking and
// cancellation can commit their idempotency record and this ledger together.
export async function lockCreditBooking(tx: Prisma.TransactionClient, purchaseId: string, bookingId: string) {
  const reference = await tx.packagePurchase.findUnique({ where: { id: purchaseId }, select: {
    parentProfileId: true, trainerProfileId: true, parentProfile: { select: { userId: true } }, trainerProfile: { select: { userId: true } },
  } })
  if (!reference) throw new PackageCreditError('Package purchase not found', 404)
  const accounts = await tx.$queryRaw<Array<{ id: string; role: string; deletedAt: Date | null }>>`
    SELECT id, role, "deletedAt" FROM users WHERE id IN (${reference.parentProfile.userId}, ${reference.trainerProfile.userId}) ORDER BY id FOR SHARE`
  await tx.$queryRaw`SELECT id FROM parent_profiles WHERE id = ${reference.parentProfileId} FOR NO KEY UPDATE`
  await tx.$queryRaw`SELECT id FROM trainer_profiles WHERE id = ${reference.trainerProfileId} FOR UPDATE`
  await tx.$queryRaw`SELECT id FROM package_purchases WHERE id = ${purchaseId} FOR UPDATE`
  const booking = await tx.booking.findUnique({ where: { id: bookingId } })
  if (!booking || booking.parentProfileId !== reference.parentProfileId || booking.trainerProfileId !== reference.trainerProfileId) {
    throw new PackageCreditError('Booking does not belong to this package purchase', 404)
  }
  await tx.$queryRaw`SELECT id FROM service_offerings WHERE id = ${booking.serviceOfferingId} FOR UPDATE`
  await tx.$queryRaw`SELECT id FROM athlete_profiles WHERE id = ${booking.athleteProfileId} FOR UPDATE`
  await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${bookingId} FOR UPDATE`
  return { reference, accounts, booking: await tx.booking.findUniqueOrThrow({ where: { id: bookingId } }) }
}

export async function redeemPackageCredit(tx: Prisma.TransactionClient, actorId: string, purchaseId: string, bookingId: string) {
  const { reference, accounts, booking } = await lockCreditBooking(tx, purchaseId, bookingId)
  if (actorId !== reference.parentProfile.userId || !accounts.some(user => user.id === actorId && user.role === 'PARENT' && !user.deletedAt)) {
    throw new PackageCreditError('Only the purchasing parent can use package credits', 403)
  }
  const existing = await tx.packageCreditRedemption.findUnique({ where: { bookingId } })
  if (existing) {
    if (existing.purchaseId !== purchaseId || existing.serviceOfferingId !== booking.serviceOfferingId) throw new PackageCreditError('This booking already uses another package')
    return existing
  }
  return tx.packageCreditRedemption.create({ data: { bookingId, purchaseId, serviceOfferingId: booking.serviceOfferingId } })
}

export async function restoreCancelledPackageCredit(tx: Prisma.TransactionClient, actor: { id: string; role: string }, bookingId: string) {
  const reference = await tx.packageCreditRedemption.findUnique({ where: { bookingId } })
  if (!reference) throw new PackageCreditError('Credit booking not found', 404)
  const locked = await lockCreditBooking(tx, reference.purchaseId, bookingId)
  const ownerId = actor.role === 'PARENT' ? locked.reference.parentProfile.userId : actor.role === 'TRAINER' ? locked.reference.trainerProfile.userId : null
  if (actor.id !== ownerId || !locked.accounts.some(user => user.id === actor.id && user.role === actor.role && !user.deletedAt)) {
    throw new PackageCreditError('Only the owning parent or trainer can restore cancellation credits', 403)
  }
  if (locked.booking.status !== 'CANCELLED') throw new PackageCreditError('Only a cancelled booking can restore a session credit')
  const saved = await tx.packageCreditRedemption.findUniqueOrThrow({ where: { bookingId } })
  if (saved.restoredAt) return saved
  const [clock] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`
  const reason = creditRestorationReason(actor.role, locked.booking.startsAt, clock.now)
  if (!reason) return saved
  return tx.packageCreditRedemption.update({ where: { bookingId }, data: { restoredAt: clock.now, restoredByUserId: actor.id, restorationReason: reason } })
}
