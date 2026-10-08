import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { closeAccount } from '@/lib/account-closure'
import { slugify } from '@/lib/utils'

const userId = z.string().trim().min(1).max(128)
const revision = z.string().datetime()
export const userAdminActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('change_role'), userId, revision, role: z.enum(['PARENT', 'TRAINER', 'ADMIN']),
    firstName: z.string().trim().min(1).max(50).optional(), lastName: z.string().trim().min(1).max(50).optional() }).strict(),
  z.object({ action: z.literal('delete'), userId, revision, reason: z.string().trim().min(1).max(2000) }).strict(),
])
export const adminUserFields = { id: true, email: true, role: true, image: true, createdAt: true, updatedAt: true, emailVerified: true, deletedAt: true } as const
export class UserAdminActionError extends Error {
  constructor(message: string, public readonly status: number) { super(message) }
}

export async function applyUserAdminAction(adminUserId: string, input: z.infer<typeof userAdminActionSchema>) {
  return prisma.$transaction(async tx => {
    // All administrator-membership writers take this lock before user row locks.
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(746726, 2)`
    await tx.$queryRaw`SELECT id FROM users WHERE id IN (${adminUserId}, ${input.userId}) ORDER BY id FOR UPDATE`
    const actor = await tx.user.findUnique({ where: { id: adminUserId }, select: { role: true, deletedAt: true } })
    if (actor?.role !== 'ADMIN' || actor.deletedAt) throw new UserAdminActionError('Administrator access is required', 403)
    const user = await tx.user.findUnique({ where: { id: input.userId }, include: { parentProfile: true, trainerProfile: true } })
    if (!user) throw new UserAdminActionError('User not found', 404)
    if (user.deletedAt) throw new UserAdminActionError('This account has been deactivated. Reload the user list.', 409)
    if (user.updatedAt.toISOString() !== input.revision) throw new UserAdminActionError('Account changed. Reload and review it before continuing.', 409)
    if (user.role === 'ADMIN' && (input.action === 'delete' || input.role !== 'ADMIN')) {
      if (await tx.user.count({ where: { role: 'ADMIN', deletedAt: null } }) <= 1) throw new UserAdminActionError('Cannot remove the last active administrator', 409)
    }
    if (input.action === 'delete') {
      if (user.id === adminUserId) throw new UserAdminActionError('Use another administrator account to deactivate this account.', 403)
      await closeAccount(tx, user.id)
      await tx.adminAction.create({ data: { adminUserId, actionType: 'DEACTIVATE_USER', targetType: 'USER', targetId: user.id,
        description: 'Deactivated and anonymized account; financial history retained',
        metadata: { previousRole: user.role, reason: input.reason, previousRevision: input.revision } } })
      return { success: true, deleted: true }
    }
    if (input.role === user.role) return tx.user.findUniqueOrThrow({ where: { id: user.id }, select: adminUserFields })
    if (input.role === 'PARENT' && !user.parentProfile) await tx.parentProfile.create({ data: { userId: user.id } })
    if (input.role === 'TRAINER' && !user.trainerProfile) {
      if (!input.firstName || !input.lastName) throw new UserAdminActionError('First and last name are required for a new trainer profile', 400)
      await tx.trainerProfile.create({ data: { userId: user.id, firstName: input.firstName, lastName: input.lastName,
        slug: `${slugify(`${input.firstName}-${input.lastName}`)}-${randomUUID()}`, approvalStatus: 'PENDING' } })
    }
    if (user.trainerProfile && input.role !== 'TRAINER') {
      await tx.$queryRaw`SELECT id FROM trainer_profiles WHERE id = ${user.trainerProfile.id} FOR UPDATE`
      await tx.trainerProfile.update({ where: { id: user.trainerProfile.id }, data: { isActive: false, featured: false } })
    }
    const updated = await tx.user.update({ where: { id: user.id }, data: { role: input.role, sessionVersion: { increment: 1 },
      updatedAt: new Date(Math.max(Date.now(), user.updatedAt.getTime() + 1)) }, select: adminUserFields })
    await tx.adminAction.create({ data: { adminUserId, actionType: 'CHANGE_ROLE', targetType: 'USER', targetId: user.id,
      description: `Changed role from ${user.role} to ${input.role}`,
      metadata: { previousRole: user.role, newRole: input.role, previousRevision: input.revision, revision: updated.updatedAt.toISOString() } } })
    return updated
  })
}
