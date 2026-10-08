import type { Prisma } from '@prisma/client'
import { hash } from 'bcryptjs'
import { randomBytes } from 'node:crypto'

// Caller holds the user row lock. Keep financial and audit relationships intact.
export async function closeAccount(tx: Prisma.TransactionClient, userId: string) {
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, include: { parentProfile: true, trainerProfile: true } })
  if (user.deletedAt) return
  if (user.trainerProfile) await tx.$queryRaw`SELECT id FROM trainer_profiles WHERE id = ${user.trainerProfile.id} FOR UPDATE`
  const now = new Date(Math.max(Date.now(), user.updatedAt.getTime() + 1))
  const randomPasswordHash = await hash(randomBytes(32).toString('hex'), 12)
  await tx.notification.deleteMany({ where: { userId } })
  const favorites: Prisma.FavoriteWhereInput[] = []
  if (user.parentProfile) favorites.push({ parentProfileId: user.parentProfile.id })
  if (user.trainerProfile) favorites.push({ trainerProfileId: user.trainerProfile.id })
  if (favorites.length) await tx.favorite.deleteMany({ where: { OR: favorites } })
  await tx.uploadedAsset.deleteMany({ where: { userId } })
  await tx.message.updateMany({ where: { senderId: userId }, data: { content: 'Message removed because this account was deleted.', isFlagged: false } })
  await tx.messageThread.updateMany({ where: { OR: [{ participantAId: userId }, { participantBId: userId }] }, data: { isActive: false, lastMessageAt: now } })
  if (user.parentProfile) {
    await tx.athleteProfile.updateMany({ where: { parentProfileId: user.parentProfile.id }, data: { firstName: 'Deleted', lastName: 'Athlete', goals: [], notes: null } })
    await tx.parentProfile.update({ where: { id: user.parentProfile.id }, data: {
      phone: null, address: null, city: null, state: null, zipCode: null, latitude: null, longitude: null,
    } })
  }
  if (user.trainerProfile) {
    const trainerProfileId = user.trainerProfile.id
    await tx.connectAccountAttempt.updateMany({ where: { trainerProfileId }, data: { email: null } })
    await tx.trainerProfile.update({ where: { id: trainerProfileId }, data: {
      firstName: 'Deleted', lastName: 'Trainer', slug: `deleted-trainer-${trainerProfileId}`,
      headline: null, bio: null, phone: null, address: null, city: null, state: null, zipCode: null,
      latitude: null, longitude: null, isActive: false, featured: false,
    } })
    await tx.serviceOffering.updateMany({ where: { trainerProfileId }, data: { isActive: false } })
    await tx.package.updateMany({ where: { trainerProfileId }, data: { isActive: false } })
    await tx.availabilitySlot.updateMany({ where: { trainerProfileId }, data: { isAvailable: false } })
  }
  await tx.user.update({ where: { id: userId }, data: {
    email: `deleted-${userId}-${now.getTime()}@deleted.trainr.local`, emailVerified: null,
    passwordHash: randomPasswordHash, sessionVersion: { increment: 1 }, deletedAt: now, image: null,
    verificationToken: null, verificationExpiry: null, resetPasswordToken: null, resetPasswordExpiry: null, updatedAt: now,
  } })
}
