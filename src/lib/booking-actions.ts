import { z } from 'zod'
import { prisma } from '@/lib/prisma'

export const bookingActionSchema = z.object({
  action: z.enum(['confirm', 'cancel', 'complete', 'no_show']),
  reason: z.string().trim().max(2000).optional(),
})

export class BookingActionError extends Error {
  constructor(message: string, public readonly status: number) { super(message) }
}

export async function applyBookingAction(bookingId: string, actor: { id: string; role?: string }, input: z.infer<typeof bookingActionSchema>) {
  return prisma.$transaction(async (tx) => {
    // Revocation writers lock users first; retain current authority through commit.
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${actor.id} FOR SHARE`
    const currentActor = await tx.user.findUnique({ where: { id: actor.id }, select: { role: true, deletedAt: true } })
    if (!currentActor || currentActor.deletedAt || currentActor.role !== actor.role) {
      throw new BookingActionError('Account access changed. Sign in again before updating a booking.', 403)
    }
    // Keep booking/payment order consistent with checkout and webhook settlement.
    await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${bookingId} FOR UPDATE`
    await tx.$queryRaw`SELECT id FROM payments WHERE "bookingId" = ${bookingId} FOR UPDATE`
    const booking = await tx.booking.findUnique({
      where: { id: bookingId }, include: { trainerProfile: true, parentProfile: true, payment: true },
    })
    if (!booking) throw new BookingActionError('Booking not found', 404)
    const parent = actor.role === 'PARENT' && booking.parentProfile.userId === actor.id
    const trainer = actor.role === 'TRAINER' && booking.trainerProfile.userId === actor.id
    const admin = actor.role === 'ADMIN'
    if (!parent && !trainer && !admin) throw new BookingActionError('Not authorized', 403)
    if (input.action !== 'cancel' && !trainer && !admin) throw new BookingActionError('Only trainers or admins can perform this action', 403)
    const target = { confirm: 'CONFIRMED', cancel: 'CANCELLED', complete: 'COMPLETED', no_show: 'NO_SHOW' } as const
    const status = target[input.action]
    const payment = booking.payment
    if (booking.status === status) return tx.booking.findUnique({ where: { id: booking.id } })
    const allowed = input.action === 'cancel' ? ['PENDING', 'CONFIRMED'] : input.action === 'confirm' ? ['PENDING'] : ['CONFIRMED']
    if (!allowed.includes(booking.status)) throw new BookingActionError('Booking cannot make this status transition', 409)
    if (input.action !== 'cancel' && (!payment || payment.status !== 'SUCCEEDED' || payment.refundAmountInCents !== 0 || payment.refundPendingAmountInCents > 0 ||
        payment.amountInCents !== booking.totalAmountInCents || booking.totalAmountInCents < 0)) {
      throw new BookingActionError('Verified, fully settled payment is required before confirming or completing this session', 409)
    }
    const updated = await tx.booking.update({ where: { id: booking.id }, data: {
      status, ...(input.action === 'cancel' ? { cancellationReason: input.reason || `Cancelled by ${admin ? 'admin' : parent ? 'parent' : 'trainer'}` } : {}),
    } })
    if (input.action === 'complete') {
      await tx.trainerProfile.update({ where: { id: booking.trainerProfileId }, data: {
        totalSessions: { increment: 1 }, totalBookings: { increment: 1 },
      } })
    }
    const moneyReview = input.action === 'cancel' && payment && payment.amountInCents > 0 && payment.status !== 'REFUNDED'
    const content = {
      confirm: { type: 'BOOKING_CONFIRMED', title: 'Booking confirmed', message: booking.totalAmountInCents === 0 ? 'Your session is confirmed. No payment is due.' : 'Your paid session has been confirmed.' },
      complete: { type: 'SESSION_COMPLETED', title: 'Session completed', message: 'Your training session has been marked complete. Please leave a review.' },
      no_show: { type: 'NO_SHOW', title: 'No-show recorded', message: 'A no-show has been recorded for your session. Contact support if this is incorrect.' },
      cancel: { type: 'BOOKING_CANCELLED', title: 'Booking cancelled', message: moneyReview
        ? 'This booking is cancelled. Its payment needs reconciliation by support. Cancellation is not a refund receipt; no refund has been issued by this action.'
        : 'This booking is cancelled. This notice does not represent a Stripe refund.' },
    }[input.action]
    const recipients = input.action === 'cancel' ? [booking.parentProfile.userId, booking.trainerProfile.userId] : [booking.parentProfile.userId]
    const notifications = Array.from(new Set(recipients)).map((userId) => ({ userId, ...content, data: { bookingId } }))
    if (moneyReview) {
      const operators = await tx.user.findMany({ where: { role: 'ADMIN', deletedAt: null }, select: { id: true } })
      notifications.push(...operators.map(({ id }) => ({
        userId: id, type: 'PAYMENT_REVIEW_REQUIRED', title: 'Cancelled booking payment requires review',
        message: 'Reconcile the saved checkout and Stripe payment before issuing any refund. No refund or transfer reversal was submitted by this cancellation.', data: { bookingId },
      })))
    }
    await tx.notification.createMany({ data: notifications })
    if (admin) {
      await tx.adminAction.create({ data: {
        adminUserId: actor.id, actionType: `BOOKING_${input.action.toUpperCase()}`, targetType: 'BOOKING', targetId: booking.id,
        description: `Admin ${input.action} booking ${booking.id}`, metadata: { reason: input.reason || null, previousStatus: booking.status, status },
      } })
    }
    return updated
  })
}
