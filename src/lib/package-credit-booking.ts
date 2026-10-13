import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { BookingCreationError, resolveAvailableBooking } from '@/lib/booking-slot'
import { lockCreditPurchase } from '@/lib/package-credit-ledger'
import { creditBookingSchema } from '@/lib/package-credit-booking-schema'
import { creditBookingInclude, packageCreditFunding } from '@/lib/package-credit-booking-hold'
import { creditPurchaseInclude, creditServiceInclude, creditServiceAvailable, requireCreditPayment } from '@/lib/credit-purchase-state'
import { packageValidity } from '@/lib/package-validity'
import { readPackageReviewHolds } from '@/lib/package-review-presence'

export async function createCreditBooking(userId: string, raw: unknown) {
  const { requestId, ...input } = creditBookingSchema.parse(raw)
  const payloadHash = createHash('sha256').update(JSON.stringify({ funding: 'PACKAGE_CREDIT', ...input })).digest('hex')
  return prisma.$transaction(async tx => {
    // Scope the untrusted ID before taking locks or revealing purchase state.
    const owned = await tx.packagePurchase.findFirst({ where: { id: input.purchaseId, parentProfile: { userId } }, select: { id: true } })
    if (!owned) throw new BookingCreationError('Package purchase not found', 404)
    const { reference, accounts } = await lockCreditPurchase(tx, owned.id)
    if (reference.parentProfile.userId !== userId || !accounts.some(user => user.id === userId && user.role === 'PARENT' && !user.deletedAt)) {
      throw new BookingCreationError('Parent access is required', 403)
    }
    const previous = await tx.bookingCreateRequest.findUnique({ where: { parentProfileId_requestId: { parentProfileId: reference.parentProfileId, requestId } } })
    const readSaved = async (id: string) => {
      const saved = await tx.booking.findFirst({ where: { id, parentProfileId: reference.parentProfileId }, include: { ...creditBookingInclude, payment: true } })
      if (!saved || saved.creditRedemption?.purchaseId !== owned.id) throw new BookingCreationError('Saved booking is unavailable. Check your dashboard.', 409)
      const held = await readPackageReviewHolds(tx, [owned.id])
      return { id: saved.id, status: saved.status, creditFunding: packageCreditFunding(saved, held.has(owned.id)) }
    }
    if (previous) {
      if (previous.payloadHash !== payloadHash || !previous.bookingId) throw new BookingCreationError('This booking request was already used. Check your dashboard before reserving again.', 409)
      return readSaved(previous.bookingId)
    }
    if (!accounts.some(user => user.id === reference.trainerProfile.userId && user.role === 'TRAINER' && !user.deletedAt)) {
      throw new BookingCreationError('Trainer is not available for booking', 409)
    }
    const purchase = await tx.packagePurchase.findUniqueOrThrow({ where: { id: owned.id }, include: creditPurchaseInclude })
    const held = await readPackageReviewHolds(tx, [purchase.id])
    const { terms, receipt } = requireCreditPayment(purchase, held.has(purchase.id))
    const item = terms.items.find(item => item.serviceOfferingId === input.serviceOfferingId)
    const grant = purchase.creditGrants.find(grant => grant.serviceOfferingId === input.serviceOfferingId)
    if (!item || !grant || grant.sessionsCount !== item.sessionsCount) throw new BookingCreationError('This service has no verified credits in this purchase.', 409)
    if (grant._count.redemptions >= grant.sessionsCount) throw new BookingCreationError('No session credits remain for this service.', 409)
    await tx.$queryRaw`SELECT id FROM service_offerings WHERE id = ${input.serviceOfferingId} FOR UPDATE`
    await tx.$queryRaw`SELECT id FROM athlete_profiles WHERE id = ${input.athleteProfileId} FOR UPDATE`
    await tx.$queryRaw`SELECT id FROM sports WHERE id = ${item.sportId} FOR SHARE`
    const service = await tx.serviceOffering.findUnique({ where: { id: input.serviceOfferingId }, include: creditServiceInclude })
    if (!service || !creditServiceAvailable(service, reference.trainerProfileId, item)) {
      throw new BookingCreationError('The purchased service is unavailable or its session terms changed. Contact the trainer.', 409)
    }
    const child = await tx.athleteProfile.findFirst({ where: { id: input.athleteProfileId, parentProfileId: reference.parentProfileId }, include: { sports: true } })
    if (!child) throw new BookingCreationError('Athlete not found', 404)
    if (!child.sports.some(sport => sport.sportId === item.sportId)) throw new BookingCreationError('Choose an athlete registered for this sport', 400)
    const { date, timing } = await resolveAvailableBooking(tx, service, child.id, service.trainerProfile.timeZone, input)
    const [clock] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`
    const validity = packageValidity(terms, receipt.paidAt)
    if (!validity || clock.now < validity.startsAt || clock.now >= validity.expiresAt || timing.startsAt >= validity.expiresAt || timing.startsAt <= clock.now) {
      throw new BookingCreationError('Choose a future session that starts before the package expires.', 409)
    }
    const booking = await tx.booking.create({ data: {
      parentProfileId: reference.parentProfileId, trainerProfileId: reference.trainerProfileId, athleteProfileId: child.id,
      serviceOfferingId: service.id, date, startTime: input.startTime, ...timing, notes: input.notes,
      status: 'CONFIRMED', totalAmountInCents: 0, platformFeeInCents: 0, trainerPayoutInCents: 0,
    } })
    // The SQL guard rechecks receipt, capacity of the credit grant and database time.
    // No per-booking payment, checkout or wallet entry is created.
    await tx.packageCreditRedemption.create({ data: { bookingId: booking.id, purchaseId: purchase.id, serviceOfferingId: service.id } })
    await tx.notification.createMany({ data: [userId, reference.trainerProfile.userId].map(recipient => ({
      userId: recipient, type: 'BOOKING_CONFIRMED' as const, title: 'Session confirmed with package credit',
      message: `${service.title} on ${input.date} at ${input.startTime} (${timing.timeZone}). One package session credit used. No new charge.`,
      data: { bookingId: booking.id },
    })) })
    await tx.bookingCreateRequest.create({ data: { parentProfileId: reference.parentProfileId, requestId, payloadHash, bookingId: booking.id } })
    return readSaved(booking.id)
  })
}
