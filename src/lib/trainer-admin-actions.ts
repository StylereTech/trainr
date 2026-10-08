import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

const revision = z.string().datetime()
const reason = z.string().trim().min(1).max(2000)
export const trainerAdminActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve'), revision }).strict(),
  z.object({ action: z.literal('reject'), revision, reason }).strict(),
  z.object({ action: z.literal('suspend'), revision, reason }).strict(),
  z.object({ action: z.literal('feature'), revision, featured: z.boolean() }).strict(),
  z.object({ action: z.literal('toggle_active'), revision, isActive: z.boolean() }).strict(),
])

export class TrainerAdminActionError extends Error {
  constructor(message: string, public readonly status: number) { super(message) }
}

export async function applyTrainerAdminAction(trainerId: string, adminUserId: string, input: z.infer<typeof trainerAdminActionSchema>) {
  return prisma.$transaction(async tx => {
    // Hold the actor's role stable, then serialize with profile edits and reservations.
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${adminUserId} FOR SHARE`
    const actor = await tx.user.findUnique({ where: { id: adminUserId }, select: { role: true, deletedAt: true } })
    if (actor?.role !== 'ADMIN' || actor.deletedAt) throw new TrainerAdminActionError('Administrator access is required', 403)
    await tx.$queryRaw`SELECT id FROM trainer_profiles WHERE id = ${trainerId} FOR UPDATE`
    const trainer = await tx.trainerProfile.findUnique({ where: { id: trainerId }, include: { user: { select: { role: true, deletedAt: true } } } })
    if (!trainer) throw new TrainerAdminActionError('Trainer not found', 404)
    if (trainer.updatedAt.toISOString() !== input.revision) {
      throw new TrainerAdminActionError('Trainer profile changed. Reload and review it before applying this decision.', 409)
    }
    const enabling = input.action === 'approve' || (input.action === 'toggle_active' && input.isActive) || (input.action === 'feature' && input.featured)
    if (enabling && (trainer.user.role !== 'TRAINER' || trainer.user.deletedAt)) {
      throw new TrainerAdminActionError('An active trainer account is required before enabling this listing.', 409)
    }

    const data: Prisma.TrainerProfileUpdateInput = {}
    let notification: { title: string; message: string } | undefined
    const decisionReason = 'reason' in input ? input.reason : null
    switch (input.action) {
      case 'approve':
        if (trainer.approvalStatus === 'APPROVED') return trainer
        data.approvalStatus = 'APPROVED'
        data.approvedAt = new Date()
        data.rejectedReason = null
        notification = { title: 'Trainer listing approved', message: 'Your trainer listing was approved. Availability and payment setup still determine whether a session can be booked and paid.' }
        break
      case 'reject':
      case 'suspend':
        data.approvalStatus = input.action === 'reject' ? 'REJECTED' : 'SUSPENDED'
        if (trainer.approvalStatus === data.approvalStatus && trainer.rejectedReason === input.reason) return trainer
        data.rejectedReason = input.reason
        notification = { title: input.action === 'reject' ? 'Trainer application update' : 'Trainer listing suspended',
          message: `Your trainer listing ${input.action === 'reject' ? 'was not approved' : 'was suspended'}. New bookings are unavailable. Reason: ${input.reason}` }
        break
      case 'feature':
        if (trainer.featured === input.featured) return trainer
        data.featured = input.featured
        break
      case 'toggle_active':
        if (trainer.isActive === input.isActive) return trainer
        data.isActive = input.isActive
        break
    }
    data.updatedAt = new Date(Math.max(Date.now(), trainer.updatedAt.getTime() + 1))
    const updated = await tx.trainerProfile.update({ where: { id: trainerId }, data })
    await tx.adminAction.create({ data: {
      adminUserId, actionType: input.action, targetType: 'TRAINER', targetId: trainerId,
      description: `${input.action} trainer ${trainer.firstName} ${trainer.lastName}`,
      metadata: { reason: decisionReason, previousStatus: trainer.approvalStatus, status: updated.approvalStatus,
        previousActive: trainer.isActive, isActive: updated.isActive, previousFeatured: trainer.featured, featured: updated.featured,
        previousRevision: trainer.updatedAt.toISOString(), revision: updated.updatedAt.toISOString() },
    } })
    if (notification) await tx.notification.create({ data: {
      userId: trainer.userId, type: `TRAINER_${input.action.toUpperCase()}`, ...notification, data: { trainerId, action: input.action },
    } })
    return updated
  })
}
