import { prisma } from '@/lib/prisma'
import { calculateDiscount, calculateSplit, isSupportedBookingTotal } from '@/lib/fees'
import { isTimeSlotAvailable, minutesToTime, timeToMinutes } from '@/lib/availability'
import type { BookingInput } from '@/lib/validations'
import { effectiveFeeValues } from '@/lib/fee-config'

export class BookingCreationError extends Error {
  constructor(message: string, public readonly status: number) { super(message) }
}

export async function createBooking(userId: string, data: BookingInput) {
  const date = new Date(`${data.date}T00:00:00.000Z`)
  return prisma.$transaction(async (tx) => {
    const parent = await tx.parentProfile.findUnique({ where: { userId }, include: { user: { select: { email: true } } } })
    if (!parent) throw new BookingCreationError('Parent profile not found', 404)
    const reference = await tx.serviceOffering.findUnique({ where: { id: data.serviceOfferingId }, select: { trainerProfileId: true } })
    if (!reference) throw new BookingCreationError('Service not found', 404)

    // Every reservation for this trainer/athlete must observe the preceding commit.
    await tx.$queryRaw`SELECT id FROM trainer_profiles WHERE id = ${reference.trainerProfileId} FOR UPDATE`
    await tx.$queryRaw`SELECT id FROM service_offerings WHERE id = ${data.serviceOfferingId} FOR UPDATE`
    await tx.$queryRaw`SELECT id FROM athlete_profiles WHERE id = ${data.athleteProfileId} FOR UPDATE`
    const service = await tx.serviceOffering.findUnique({ where: { id: data.serviceOfferingId }, include: { trainerProfile: true } })
    if (!service || !service.isActive || service.trainerProfileId !== reference.trainerProfileId ||
        !service.trainerProfile.isActive || service.trainerProfile.approvalStatus !== 'APPROVED') {
      throw new BookingCreationError('Trainer or service is not available for booking', 409)
    }
    const athlete = await tx.athleteProfile.findFirst({
      where: { id: data.athleteProfileId, parentProfileId: parent.id }, include: { sports: { select: { sportId: true } } },
    })
    if (!athlete) throw new BookingCreationError('Athlete not found', 404)
    if (service.sportId && !athlete.sports.some((sport) => sport.sportId === service.sportId)) {
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
    const start = timeToMinutes(data.startTime)
    const end = start + service.durationMinutes
    const endTime = minutesToTime(end)
    const existing = await tx.booking.findMany({
      where: {
        date, status: { notIn: ['CANCELLED', 'RESCHEDULED'] },
        OR: [{ trainerProfileId: service.trainerProfileId }, { athleteProfileId: athlete.id }],
      },
      select: { trainerProfileId: true, athleteProfileId: true, serviceOfferingId: true, startTime: true, endTime: true },
    })
    const overlapping = existing.filter((booking) => start < timeToMinutes(booking.endTime) && end > timeToMinutes(booking.startTime))
    if (overlapping.some((booking) => booking.athleteProfileId === athlete.id)) {
      throw new BookingCreationError('This athlete already has a booking at that time', 409)
    }
    const trainerBookings = overlapping.filter((booking) => booking.trainerProfileId === service.trainerProfileId)
    const matchingGroup = service.type === 'GROUP' && trainerBookings.every((booking) =>
      booking.serviceOfferingId === service.id && booking.startTime === data.startTime && booking.endTime === endTime)
    if (trainerBookings.length && (!matchingGroup || trainerBookings.length >= service.maxParticipants)) {
      throw new BookingCreationError('This time overlaps an existing session or the group is full', 409)
    }

    let discount = 0
    if (data.couponCode) {
      const code = data.couponCode.toUpperCase().replace(/[^A-Z0-9]/g, '')
      await tx.$queryRaw`SELECT id FROM coupons WHERE code = ${code} FOR UPDATE`
      const coupon = await tx.coupon.findUnique({ where: { code } })
      if (!coupon || !coupon.isActive || coupon.currentUses >= coupon.maxUses ||
          (coupon.expiresAt && coupon.expiresAt <= new Date()) ||
          (coupon.applicableSportId && coupon.applicableSportId !== service.sportId)) {
        throw new BookingCreationError('Coupon is invalid, expired, exhausted or does not apply to this sport', 400)
      }
      const percent = coupon.discountPercent
      const fixed = coupon.discountAmountInCents
      if ((percent === null) === (fixed === null) ||
          (percent !== null && (!Number.isInteger(percent) || percent < 1 || percent > 100)) ||
          (fixed !== null && (!Number.isInteger(fixed) || fixed <= 0))) {
        throw new BookingCreationError('Coupon discount requires correction', 400)
      }
      discount = Math.min(service.priceInCents, calculateDiscount(service.priceInCents, percent, fixed))
      await tx.coupon.update({ where: { id: coupon.id }, data: { currentUses: { increment: 1 } } })
    }
    const total = service.priceInCents - discount
    if (!isSupportedBookingTotal(total)) {
      throw new BookingCreationError('Booking total must be zero or between $0.50 and $999,999.99. Change the promo code or contact support.', 400)
    }
    const { platformFee, trainerShare } = calculateSplit(total, fees.platformCommissionPercent)
    const free = total === 0
    const booking = await tx.booking.create({
      data: {
        parentProfileId: parent.id, trainerProfileId: service.trainerProfileId, athleteProfileId: athlete.id,
        serviceOfferingId: service.id, date, startTime: data.startTime, endTime, notes: data.notes,
        totalAmountInCents: total, platformFeeInCents: platformFee, trainerPayoutInCents: trainerShare,
        status: free ? 'CONFIRMED' : 'PENDING',
        ...(free ? { payment: { create: { amountInCents: 0, platformFeeInCents: 0, trainerPayoutInCents: 0, status: 'SUCCEEDED' as const } } } : {}),
      },
      include: { serviceOffering: true, trainerProfile: { include: { sports: { include: { sport: true } } } }, athleteProfile: true },
    })
    await tx.notification.create({ data: {
      userId: service.trainerProfile.userId,
      type: free ? 'BOOKING_CONFIRMED' : 'BOOKING_REQUEST',
      title: free ? 'Booking confirmed - no payment due' : 'New booking request',
      message: `${parent.user.email} requested ${service.title} on ${data.date} at ${data.startTime}.${free ? ' No payment is due and no Stripe charge or trainer payout was created.' : ' Payment is pending.'}`,
      data: { bookingId: booking.id },
    } })
    return booking
  })
}
