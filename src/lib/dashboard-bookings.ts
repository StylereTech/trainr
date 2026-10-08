import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { bookingStates, viewStates, type DashboardView } from '@/lib/dashboard-contract'

export class DashboardReadError extends Error {
  constructor(message: string, public status: number) { super(message) }
}
export async function readDashboardBookings(actor: { id: string; role?: string }, view: DashboardView, requestedPage: number, limit: number) {
  if (!['PARENT', 'TRAINER'].includes(actor.role || '')) throw new DashboardReadError('Dashboard access requires a parent or trainer account', 403)
  if (!(actor.role === 'PARENT' ? ['upcoming', 'past'] : ['pending', 'confirmed', 'completed', 'all']).includes(view)) throw new DashboardReadError('Invalid dashboard view for this role', 400)
  return prisma.$transaction(async tx => {
    const profile = actor.role === 'PARENT' ? await tx.parentProfile.findUnique({ where: { userId: actor.id }, select: { id: true } }) : await tx.trainerProfile.findUnique({ where: { userId: actor.id }, select: { id: true } })
    if (!profile) throw new DashboardReadError('Profile not found', 404)
    const scope: Prisma.BookingWhereInput = actor.role === 'PARENT' ? { parentProfileId: profile.id } : { trainerProfileId: profile.id }
    const grouped = await tx.booking.groupBy({ by: ['status'], where: scope, _count: { _all: true } })
    const counts = Object.fromEntries(bookingStates.map(status => [status, grouped.find(row => row.status === status)?._count._all || 0])) as Record<typeof bookingStates[number], number>
    const total = viewStates[view].reduce((sum, status) => sum + counts[status], 0)
    const totalPages = Math.ceil(total / limit)
    const page = Math.min(requestedPage, Math.max(1, totalPages))
    const rows = await tx.booking.findMany({ where: { ...scope, status: { in: viewStates[view] } },
      select: { id: true, date: true, startTime: true, endTime: true, status: true, totalAmountInCents: true, trainerPayoutInCents: true, notes: true,
        serviceOffering: { select: { title: true, durationMinutes: true } },
        trainerProfile: { select: { firstName: true, lastName: true, stripeAccountId: true, stripeOnboardingComplete: true } },
        parentProfile: { select: { user: { select: { email: true } } } }, athleteProfile: { select: { firstName: true, lastName: true } }, review: { select: { id: true } },
        payment: { select: { status: true, refundAmountInCents: true, refundPendingAmountInCents: true, refundFailedCount: true, refundsVerifiedAt: true } } },
      orderBy: [{ date: view === 'past' || view === 'completed' || view === 'all' ? 'desc' : 'asc' }, { startTime: 'asc' }, { id: 'asc' }], skip: (page - 1) * limit, take: limit })
    const reviewsToLeave = actor.role === 'PARENT' ? await tx.booking.count({ where: { ...scope, status: 'COMPLETED', review: null } }) : 0
    return { bookings: rows.map(({ trainerProfile, ...booking }) => ({ ...booking, trainerProfile: { firstName: trainerProfile.firstName, lastName: trainerProfile.lastName,
      paymentReady: !!trainerProfile.stripeAccountId && trainerProfile.stripeOnboardingComplete } })), counts, reviewsToLeave, pagination: { page, limit, total, totalPages } }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
}
