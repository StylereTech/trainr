import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { calculateSplit } from '@/lib/fees'
import { bookingPrice, BookingPriceError, normalizeCouponCode } from '@/lib/booking-price'
import { isTimeSlotAvailable } from '@/lib/availability'
import { PAID_BOOKING_LEAD_MS, resolveBookingTime } from '@/lib/booking-time'
import { canonicalTimeZone } from '@/lib/time-zone'
import { bookingSchema, type BookingInput } from '@/lib/validations'
import { effectiveFeeValues } from '@/lib/fee-config'

export class BookingCreationError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) { super(message) }
}

const bookingDetails = { serviceOffering: true, trainerProfile: { include: { sports: { include: { sport: true } } } }, athleteProfile: true } satisfies Prisma.BookingInclude

export async function createBooking(userId: string, input: BookingInput) {
  const { requestId, ...data } = bookingSchema.parse(input)
  const payloadHash = createHash('sha256').update(JSON.stringify(data)).digest('hex')
  const date = new Date(`${data.date}T00:00:00.000Z`)
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR SHARE`
    const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true, deletedAt: true } })
    if (user?.role !== 'PARENT' || user.deletedAt) throw new BookingCreationError('Parent access is required', 403)
    // NO KEY UPDATE serializes retries without blocking booking foreign-key checks.
    await tx.$queryRaw`SELECT id FROM parent_profiles WHERE "userId" = ${userId} FOR NO KEY UPDATE`
    const parent = await tx.parentProfile.findUnique({ where: { userId }, include: { user: { select: { email: true } } } })
    if (!parent) throw new BookingCreationError('Parent profile not found', 404)
    const previous = await tx.bookingCreateRequest.findUnique({ where: { parentProfileId_requestId: { parentProfileId: parent.id, requestId } } })
    if (previous) {
      if (previous.payloadHash !== payloadHash || !previous.bookingId) throw new BookingCreationError('This booking request was already used. Check your dashboard before reserving again.', 409)
      const saved = await tx.booking.findFirst({ where: { id: previous.bookingId, parentProfileId: parent.id }, include: bookingDetails })
      if (!saved) throw new BookingCreationError('Saved booking is unavailable. Check your dashboard.', 409)
      return saved
    }
    const reference = await tx.serviceOffering.findUnique({ where: { id: data.serviceOfferingId }, select: { trainerProfileId: true } })
    if (!reference) throw new BookingCreationError('Service not found', 404)

    // Every reservation for this trainer/athlete must observe the preceding commit.
    await tx.$queryRaw`SELECT id FROM trainer_profiles WHERE id = ${reference.trainerProfileId} FOR UPDATE`
    await tx.$queryRaw`SELECT id FROM service_offerings WHERE id = ${data.serviceOfferingId} FOR UPDATE`
    await tx.$queryRaw`SELECT id FROM athlete_profiles WHERE id = ${data.athleteProfileId} FOR UPDATE`
    const service = await tx.serviceOffering.findUnique({ where: { id: data.serviceOfferingId }, include: { trainerProfile: { include: { sports: { select: { sportId: true } } } }, sport: true } })
    if (!service || !service.isActive || service.trainerProfileId !== reference.trainerProfileId ||
        !service.trainerProfile.isActive || service.trainerProfile.approvalStatus !== 'APPROVED') {
      throw new BookingCreationError('Trainer or service is not available for booking', 409)
    }
    const athlete = await tx.athleteProfile.findFirst({
      where: { id: data.athleteProfileId, parentProfileId: parent.id }, include: { sports: { select: { sportId: true } } },
    })
    if (!athlete) throw new BookingCreationError('Athlete not found', 404)
    if (!service.sportId || !service.sport?.isActive || !service.trainerProfile.sports.some((sport) => sport.sportId === service.sportId)) {
      throw new BookingCreationError('This service needs an active sport assigned by the trainer before booking', 409)
    }
    if (!athlete.sports.some((sport) => sport.sportId === service.sportId)) {
      throw new BookingCreationError('Choose an athlete registered for this sport', 400)
    }
    if (!Number.isInteger(service.priceInCents) || service.priceInCents < 0 ||
        !Number.isInteger(service.maxParticipants) || service.maxParticipants < 1) {
      throw new BookingCreationError('Service pricing or capacity requires correction', 409)
    }
    const fees = await effectiveFeeValues(tx)
    if (service.priceInCents < fees.minBookingAmountCents) {
      throw new BookingCreationError('Service price is below the current platform minimum. Contact the trainer.', 409)
    }
    const slots = await tx.availabilitySlot.findMany({ where: { trainerProfileId: service.trainerProfileId } })
    if (!isTimeSlotAvailable(slots, date, data.startTime, service.durationMinutes)) {
      throw new BookingCreationError('Trainer is not available at the requested date/time', 400)
    }
    if (canonicalTimeZone(service.trainerProfile.timeZone) !== data.timeZone) {
      throw new BookingCreationError('Trainer time zone is missing or changed. Reload before booking.', 409)
    }
    let timing: ReturnType<typeof resolveBookingTime>
    try { timing = resolveBookingTime(data.date, data.startTime, service.durationMinutes, data.timeZone) }
    catch (error) { throw new BookingCreationError(error instanceof Error ? error.message : 'Invalid session time.', 400) }
    if (timing.startsAt.getTime() <= Date.now()) throw new BookingCreationError('This session has already started. Choose a future time.', 400)
    const existing = await tx.booking.findMany({
      where: {
        status: { notIn: ['CANCELLED', 'RESCHEDULED'] },
        OR: [{ trainerProfileId: service.trainerProfileId }, { athleteProfileId: athlete.id }],
        AND: [{ OR: [
          { startsAt: { lt: timing.endsAt }, endsAt: { gt: timing.startsAt } },
          // Unknown legacy zones are not guessed; require reconciliation near a proposed session.
          { startsAt: null, date: { gte: new Date(timing.startsAt.getTime() - 2 * 86400000), lte: new Date(timing.endsAt.getTime() + 2 * 86400000) } },
        ] }],
      },
      select: { trainerProfileId: true, athleteProfileId: true, serviceOfferingId: true, startsAt: true, endsAt: true },
    })
    if (existing.some(booking => !booking.startsAt || !booking.endsAt)) throw new BookingCreationError('An existing booking needs its original time zone reconciled before reserving nearby sessions. Contact support.', 409)
    if (existing.some((booking) => booking.athleteProfileId === athlete.id)) {
      throw new BookingCreationError('This athlete already has a booking at that time', 409)
    }
    const trainerBookings = existing.filter((booking) => booking.trainerProfileId === service.trainerProfileId)
    const matchingGroup = service.type === 'GROUP' && trainerBookings.every((booking) =>
      booking.serviceOfferingId === service.id && booking.startsAt!.getTime() === timing.startsAt.getTime() && booking.endsAt!.getTime() === timing.endsAt.getTime())
    if (trainerBookings.length && (!matchingGroup || trainerBookings.length >= service.maxParticipants)) {
      throw new BookingCreationError('This time overlaps an existing session or the group is full', 409)
    }

    let coupon = null
    if (data.couponCode) {
      const code = normalizeCouponCode(data.couponCode)
      await tx.$queryRaw`SELECT id FROM coupons WHERE code = ${code} FOR UPDATE`
      coupon = await tx.coupon.findUnique({ where: { code } })
    }
    let total: number
    try { total = bookingPrice(service.priceInCents, fees.minBookingAmountCents, service.sportId, Boolean(data.couponCode), coupon).totalAmountInCents }
    catch (error) {
      if (error instanceof BookingPriceError) throw new BookingCreationError(error.message, error.status)
      throw error
    }
    if (data.expectedTotalInCents !== total) throw new BookingCreationError('Price changed or needs confirmation. Review the latest total before booking.', 409, 'PRICE_CHANGED')
    if (coupon) await tx.coupon.update({ where: { id: coupon.id }, data: { currentUses: { increment: 1 } } })
    const { platformFee, trainerShare } = calculateSplit(total, fees.platformCommissionPercent)
    const free = total === 0
    if (timing.startsAt.getTime() <= Date.now() + (free ? 0 : PAID_BOOKING_LEAD_MS)) {
      throw new BookingCreationError(free ? 'This session has already started.' : 'Paid sessions require at least 31 minutes before their start for secure checkout.', 400)
    }
    const booking = await tx.booking.create({
      data: {
        parentProfileId: parent.id, trainerProfileId: service.trainerProfileId, athleteProfileId: athlete.id,
        serviceOfferingId: service.id, date, startTime: data.startTime, ...timing, notes: data.notes,
        totalAmountInCents: total, platformFeeInCents: platformFee, trainerPayoutInCents: trainerShare,
        status: free ? 'CONFIRMED' : 'PENDING',
        ...(free ? { payment: { create: { amountInCents: 0, platformFeeInCents: 0, trainerPayoutInCents: 0, status: 'SUCCEEDED' as const } } } : {}),
      },
      include: bookingDetails,
    })
    await tx.notification.create({ data: {
      userId: service.trainerProfile.userId,
      type: free ? 'BOOKING_CONFIRMED' : 'BOOKING_REQUEST',
      title: free ? 'Booking confirmed - no payment due' : 'New booking request',
      message: `${parent.user.email} requested ${service.title} on ${data.date} at ${data.startTime} (${timing.timeZone}).${free ? ' No payment is due and no Stripe charge or trainer payout was created.' : ' Payment is pending.'}`,
      data: { bookingId: booking.id },
    } })
    await tx.bookingCreateRequest.create({ data: { parentProfileId: parent.id, requestId, payloadHash, bookingId: booking.id } })
    return booking
  })
}
