import { z } from 'zod'

export const bookingStates = ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED'] as const
export const dashboardViews = ['upcoming', 'past', 'pending', 'confirmed', 'completed', 'all'] as const
export type DashboardView = typeof dashboardViews[number]
export const viewStates = {
  upcoming: ['PENDING', 'CONFIRMED'], past: ['COMPLETED', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED'],
  pending: ['PENDING'], confirmed: ['CONFIRMED'], completed: ['COMPLETED'], all: [...bookingStates],
} satisfies Record<DashboardView, Array<typeof bookingStates[number]>>
const count = z.number().int().nonnegative().safe()
const person = z.object({ firstName: z.string(), lastName: z.string() })
export const dashboardBookingSchema = z.object({
  id: z.string().min(1), date: z.string().datetime(), startTime: z.string(), endTime: z.string(),
  status: z.enum(bookingStates), totalAmountInCents: count, trainerPayoutInCents: count, notes: z.string().nullable(),
  serviceOffering: z.object({ title: z.string(), durationMinutes: count }),
  trainerProfile: person.extend({ paymentReady: z.boolean() }),
  parentProfile: z.object({ user: z.object({ email: z.string() }) }), athleteProfile: person,
  review: z.object({ id: z.string() }).nullable(),
  payment: z.object({ status: z.enum(['PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED']),
    refundAmountInCents: count, refundPendingAmountInCents: count, refundFailedCount: count, refundsVerifiedAt: z.string().datetime().nullable() }).nullable(),
})
export type DashboardBooking = z.infer<typeof dashboardBookingSchema>
export const dashboardResponseSchema = z.object({
  bookings: z.array(dashboardBookingSchema),
  counts: z.object({ PENDING: count, CONFIRMED: count, COMPLETED: count, CANCELLED: count, NO_SHOW: count, RESCHEDULED: count }),
  reviewsToLeave: count,
  pagination: z.object({ page: count.min(1), limit: count.min(1).max(100), total: count, totalPages: count }),
})
export const athletesResponseSchema = z.object({ athletes: z.array(person.extend({ id: z.string(), sports: z.array(z.object({ sport: z.object({ name: z.string() }) })) })) })
export const payoutBalanceSchema = z.discriminatedUnion('connected', [
  z.object({ source: z.literal('stripe'), connected: z.literal(false), wallet: z.null() }),
  z.object({ source: z.literal('stripe'), connected: z.literal(true), currency: z.literal('usd'), wallet: z.object({ availableBalance: z.number().int().safe(), pendingBalance: z.number().int().safe() }) }),
])
export type PayoutBalance = z.infer<typeof payoutBalanceSchema>
