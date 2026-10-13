import type { Prisma, ServiceOffering } from '@prisma/client'
import { isTimeSlotAvailable } from '@/lib/availability'
import { resolveBookingTime } from '@/lib/booking-time'
import { canonicalTimeZone } from '@/lib/time-zone'
import type { BookingInput } from '@/lib/validations'

export class BookingCreationError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) { super(message) }
}

// Call after locking the trainer, service and athlete. Cash and credit reservations
// share the same capacity and cross-trainer athlete collision rules.
export async function resolveAvailableBooking(tx: Prisma.TransactionClient, service: ServiceOffering,
  athleteId: string, trainerTimeZone: string | null, data: Pick<BookingInput, 'date' | 'startTime' | 'timeZone'>) {
  const date = new Date(`${data.date}T00:00:00.000Z`)
  const slots = await tx.availabilitySlot.findMany({ where: { trainerProfileId: service.trainerProfileId } })
  if (!isTimeSlotAvailable(slots, date, data.startTime, service.durationMinutes)) {
    throw new BookingCreationError('Trainer is not available at the requested date/time', 400)
  }
  if (canonicalTimeZone(trainerTimeZone) !== data.timeZone) {
    throw new BookingCreationError('Trainer time zone is missing or changed. Reload before booking.', 409)
  }
  let timing: ReturnType<typeof resolveBookingTime>
  try { timing = resolveBookingTime(data.date, data.startTime, service.durationMinutes, data.timeZone) }
  catch (error) { throw new BookingCreationError(error instanceof Error ? error.message : 'Invalid session time.', 400) }
  if (timing.startsAt.getTime() <= Date.now()) throw new BookingCreationError('This session has already started. Choose a future time.', 400)
  const existing = await tx.booking.findMany({
    where: {
      status: { notIn: ['CANCELLED', 'RESCHEDULED'] },
      OR: [{ trainerProfileId: service.trainerProfileId }, { athleteProfileId: athleteId }],
      AND: [{ OR: [
        { startsAt: { lt: timing.endsAt }, endsAt: { gt: timing.startsAt } },
        { startsAt: null, date: { gte: new Date(timing.startsAt.getTime() - 2 * 86400000), lte: new Date(timing.endsAt.getTime() + 2 * 86400000) } },
      ] }],
    },
    select: { trainerProfileId: true, athleteProfileId: true, serviceOfferingId: true, startsAt: true, endsAt: true },
  })
  if (existing.some(booking => !booking.startsAt || !booking.endsAt)) throw new BookingCreationError('An existing booking needs its original time zone reconciled before reserving nearby sessions. Contact support.', 409)
  if (existing.some(booking => booking.athleteProfileId === athleteId)) throw new BookingCreationError('This athlete already has a booking at that time', 409)
  const trainerBookings = existing.filter(booking => booking.trainerProfileId === service.trainerProfileId)
  const matchingGroup = service.type === 'GROUP' && trainerBookings.every(booking =>
    booking.serviceOfferingId === service.id && booking.startsAt!.getTime() === timing.startsAt.getTime() && booking.endsAt!.getTime() === timing.endsAt.getTime())
  if (trainerBookings.length && (!matchingGroup || trainerBookings.length >= service.maxParticipants)) {
    throw new BookingCreationError('This time overlaps an existing session or the group is full', 409)
  }
  return { date, timing }
}
