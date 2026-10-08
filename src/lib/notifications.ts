import { Prisma, type Notification } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { notificationDetails, notificationActionSchema, notificationQuerySchema } from '@/lib/notification-contract'
import type { z } from 'zod'

export class NotificationError extends Error {
  constructor(message: string, public status: number) { super(message) }
}
type Actor = { id: string; role: string }

async function notificationAccess(tx: Prisma.TransactionClient, actor: Actor) {
  const users = await tx.$queryRaw<Array<{ role: string; deletedAt: Date | null }>>`
    SELECT role, "deletedAt" FROM users WHERE id = ${actor.id} FOR SHARE`
  if (!users[0] || users[0].deletedAt || users[0].role !== actor.role) throw new NotificationError('Unauthorized', 401)
  // Historical admin notices remain private after demotion, including legacy fanout without an audience tag.
  return Prisma.sql`n."userId" = ${actor.id} AND (${users[0].role} = 'ADMIN' OR (
    n.type <> 'NEW_TRAINER_SIGNUP' AND (
      (n.type NOT IN ('PAYMENT_REVIEW_REQUIRED', 'PAYMENT_RECEIVED', 'REFUND_STATUS_UPDATED') AND NOT COALESCE(n.data ? 'financialReview', false))
      OR EXISTS (SELECT 1 FROM bookings b
        JOIN parent_profiles p ON p.id = b."parentProfileId"
        JOIN trainer_profiles t ON t.id = b."trainerProfileId"
        WHERE b.id = n.data->>'bookingId' AND (
          (${users[0].role} = 'PARENT' AND p."userId" = ${actor.id}) OR
          (${users[0].role} = 'TRAINER' AND t."userId" = ${actor.id})
        ))
    )))`
}

export async function readNotifications(actor: Actor, input: z.infer<typeof notificationQuerySchema>) {
  return prisma.$transaction(async tx => {
    const access = await notificationAccess(tx, actor)
    const filter = input.view === 'unread' ? Prisma.sql`AND n."readAt" IS NULL` : Prisma.empty
    const [counts] = await tx.$queryRaw<Array<{ total: number; unread: number }>>`
      SELECT count(*)::int AS total, count(*) FILTER (WHERE n."readAt" IS NULL)::int AS unread FROM notifications n WHERE ${access}`
    const total = input.view === 'unread' ? counts.unread : counts.total
    const totalPages = Math.ceil(total / input.limit)
    const page = Math.min(input.page, Math.max(1, totalPages))
    const rows = await tx.$queryRaw<Notification[]>`
      SELECT n.* FROM notifications n WHERE ${access} ${filter}
      ORDER BY n."createdAt" DESC, n.id DESC LIMIT ${input.limit} OFFSET ${(page - 1) * input.limit}`
    return { notifications: rows.map(({ id, type, title, message, createdAt, readAt, data }) => ({
      id, type, title, message, createdAt, readAt, ...notificationDetails(data),
    })), unreadCount: counts.unread, pagination: { page, limit: input.limit, total, totalPages } }
  }, { isolationLevel: 'RepeatableRead' })
}

export async function changeNotifications(actor: Actor, input: z.infer<typeof notificationActionSchema>) {
  return prisma.$transaction(async tx => {
    const access = await notificationAccess(tx, actor)
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT n.id FROM notifications n WHERE ${access} AND n.id IN (${Prisma.join(input.ids)}) ORDER BY n.id FOR UPDATE`
    if (rows.length !== input.ids.length) throw new NotificationError('Notification unavailable. Reload the inbox.', 404)
    await tx.notification.updateMany({ where: { id: { in: input.ids }, userId: actor.id,
      readAt: input.read ? null : { not: null } }, data: { readAt: input.read ? new Date() : null } })
    return { success: true }
  })
}
