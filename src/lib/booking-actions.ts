import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { bookingOutcomeTimeError } from '@/lib/booking-outcome-time'
import { bookingPaymentHold } from '@/lib/booking-payment-hold'
import { creditBookingInclude, packageCreditBookingHold } from '@/lib/package-credit-booking-hold'
import { lockCreditBooking, PackageCreditError, restoreLockedCancelledPackageCredit } from '@/lib/package-credit-ledger'
import { readPackageReviewHolds } from '@/lib/package-review-presence'

export const bookingActionSchema = z.object({
  action: z.enum(['confirm', 'cancel', 'complete', 'no_show']),
  reason: z.string().trim().max(2000).optional(),
})

export class BookingActionError extends Error {
  constructor(message: string, public readonly status: number) { super(message) }
}

export async function applyBookingAction(bookingId: string, actor: { id: string; role?: string }, input: z.infer<typeof bookingActionSchema>) {
  return prisma.$transaction(async (tx) => {
    const owners = await tx.booking.findUnique({ where: { id: bookingId }, select: {
      parentProfile: { select: { userId: true } }, trainerProfile: { select: { userId: true } },
      creditRedemption: { select: { purchaseId: true } },
    } })
    // Lock all authorities/recipients in the same order as account writers and settlement.
    const accounts = await tx.$queryRaw<Array<{ id: string; role: string; deletedAt: Date | null }>>`
      SELECT id, role, "deletedAt" FROM users
      WHERE id IN (${actor.id}, ${owners?.parentProfile.userId || ''}, ${owners?.trainerProfile.userId || ''})
        OR (role = 'ADMIN' AND "deletedAt" IS NULL)
      ORDER BY id FOR SHARE`
    const currentActor = accounts.find(account => account.id === actor.id)
    if (!currentActor || currentActor.deletedAt || currentActor.role !== actor.role) {
      throw new BookingActionError('Account access changed. Sign in again before updating a booking.', 403)
    }
    // Credits require purchase-before-booking order, matching spending and settlement.
    // Never acquire the purchase lock after taking a booking lock.
    if (owners?.creditRedemption) {
      try { await lockCreditBooking(tx, owners.creditRedemption.purchaseId, bookingId) }
      catch (error) {
        if (error instanceof PackageCreditError) throw new BookingActionError(error.message, error.status)
        throw error
      }
    }
    // Cash bookings retain the existing checkout/webhook lock order.
    await tx.$queryRaw`SELECT id FROM bookings WHERE id = ${bookingId} FOR UPDATE`
    await tx.$queryRaw`SELECT id FROM payments WHERE "bookingId" = ${bookingId} FOR UPDATE`
    const booking = await tx.booking.findUnique({
      where: { id: bookingId }, include: { trainerProfile: true, parentProfile: true, payment: true, ...creditBookingInclude },
    })
    if (!booking) throw new BookingActionError('Booking not found', 404)
    if (booking.creditRedemption?.purchaseId !== owners?.creditRedemption?.purchaseId) {
      throw new BookingActionError('Booking funding changed. Reload before updating this session.', 409)
    }
    if (booking.parentProfile.userId !== owners?.parentProfile.userId || booking.trainerProfile.userId !== owners?.trainerProfile.userId) {
      throw new BookingActionError('Booking ownership changed. Reload before updating this session.', 409)
    }
    const parent = actor.role === 'PARENT' && booking.parentProfile.userId === actor.id
    const trainer = actor.role === 'TRAINER' && booking.trainerProfile.userId === actor.id
    const admin = actor.role === 'ADMIN'
    if (!parent && !trainer && !admin) throw new BookingActionError('Not authorized', 403)
    if (input.action !== 'cancel' && !trainer && !admin) throw new BookingActionError('Only trainers or admins can perform this action', 403)
    const target = { confirm: 'CONFIRMED', cancel: 'CANCELLED', complete: 'COMPLETED', no_show: 'NO_SHOW' } as const
    const status = target[input.action]
    const payment = booking.payment
    const credit = booking.creditRedemption
    if (credit && admin && input.action === 'cancel') {
      throw new BookingActionError('Package credit cancellation requires the owning parent or trainer. Admin credit adjustments are not available.', 409)
    }
    if (booking.status === status) return tx.booking.findUnique({ where: { id: booking.id } })
    const allowed = input.action === 'cancel' ? ['PENDING', 'CONFIRMED'] : input.action === 'confirm' ? ['PENDING'] : ['CONFIRMED']
    if (!allowed.includes(booking.status)) throw new BookingActionError('Booking cannot make this status transition', 409)
    const activeParent = accounts.some(account => account.id === booking.parentProfile.userId && account.role === 'PARENT' && !account.deletedAt)
    const activeTrainer = accounts.some(account => account.id === booking.trainerProfile.userId && account.role === 'TRAINER' && !account.deletedAt)
    if (input.action !== 'cancel' && (!activeParent || !activeTrainer)) {
      throw new BookingActionError('A parent or trainer account is unavailable. Contact support to reconcile this session.', 409)
    }
    if (input.action !== 'cancel') {
      const held = await readPackageReviewHolds(tx, credit ? [credit.purchaseId] : [])
      const paymentHold = credit ? packageCreditBookingHold(booking, held.has(credit.purchaseId)) : bookingPaymentHold(booking)
      if (paymentHold) throw new BookingActionError(paymentHold, 409)
    }
    if (input.action !== 'cancel' && !credit && (!payment || payment.status !== 'SUCCEEDED' || payment.refundAmountInCents !== 0 || payment.refundPendingAmountInCents > 0 ||
        payment.amountInCents !== booking.totalAmountInCents || booking.totalAmountInCents < 0)) {
      throw new BookingActionError('Verified, fully settled payment is required before confirming or completing this session', 409)
    }
    if (input.action === 'complete' || input.action === 'no_show') {
      const timingError = bookingOutcomeTimeError(booking, input.action)
      if (timingError) throw new BookingActionError(timingError, 409)
    }
    const updated = await tx.booking.update({ where: { id: booking.id }, data: {
      status, ...(input.action === 'cancel' ? { cancellationReason: input.reason || `Cancelled by ${admin ? 'admin' : parent ? 'parent' : 'trainer'}` } : {}),
    } })
    const restoredCredit = credit && input.action === 'cancel'
      ? await restoreLockedCancelledPackageCredit(tx, { id: actor.id, role: actor.role! }, { ...updated,
        parentUserId: booking.parentProfile.userId, trainerUserId: booking.trainerProfile.userId,
      }) : null
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
      cancel: { type: 'BOOKING_CANCELLED', title: 'Booking cancelled', message: restoredCredit
        ? restoredCredit.restoredAt
          ? 'This booking is cancelled and one session credit was returned to your package. Original expiry and payment review restrictions still apply. No cash refund was issued.'
          : 'This booking is cancelled. The session credit remains used under the late-cancellation policy. No cash refund was issued.'
        : moneyReview
        ? 'This booking is cancelled. Its payment needs reconciliation by support. Cancellation is not a refund receipt; no refund has been issued by this action.'
        : 'This booking is cancelled. This notice does not represent a Stripe refund.' },
    }[input.action]
    const recipients = [
      ...(activeParent ? [booking.parentProfile.userId] : []),
      ...(input.action === 'cancel' && activeTrainer ? [booking.trainerProfile.userId] : []),
    ]
    const notifications = Array.from(new Set(recipients)).map((userId) => ({ userId, ...content, data: { bookingId } }))
    if (moneyReview) {
      const operators = accounts.filter(account => account.role === 'ADMIN' && !account.deletedAt)
      notifications.push(...operators.map(({ id }) => ({
        userId: id, type: 'PAYMENT_REVIEW_REQUIRED', title: 'Cancelled booking payment requires review',
        message: 'Reconcile the saved checkout and Stripe payment before issuing any refund. No refund or transfer reversal was submitted by this cancellation.', data: { bookingId },
      })))
    }
    if (notifications.length) await tx.notification.createMany({ data: notifications })
    if (admin) {
      await tx.adminAction.create({ data: {
        adminUserId: actor.id, actionType: `BOOKING_${input.action.toUpperCase()}`, targetType: 'BOOKING', targetId: booking.id,
        description: `Admin ${input.action} booking ${booking.id}`, metadata: { reason: input.reason || null, previousStatus: booking.status, status },
      } })
    }
    return updated
  })
}
