import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { BookingCreationError } from '@/lib/booking-slot'
import { creditPurchaseInclude, creditServiceInclude, creditServiceAvailable, requireCreditPayment } from '@/lib/credit-purchase-state'
import { packagePurchaseTermsSchema } from '@/lib/package-purchase-schema'
import { packageValidity } from '@/lib/package-validity'
import { canonicalTimeZone } from '@/lib/time-zone'
import { readPackageReviewHolds } from '@/lib/package-review-presence'

export async function readCreditBookingOptions(userId: string, purchaseId: string) {
  return prisma.$transaction(async tx => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true, deletedAt: true } })
    if (user?.role !== 'PARENT' || user.deletedAt) throw new BookingCreationError('Parent access is required', 403)
    const purchase = await tx.packagePurchase.findFirst({ where: { id: purchaseId, parentProfile: { userId } }, include: {
      ...creditPurchaseInclude, trainerProfile: { select: { firstName: true, lastName: true, timeZone: true, availabilitySlots: {
        select: { dayOfWeek: true, specificDate: true, startTime: true, endTime: true, isRecurring: true, isAvailable: true },
      } } },
    } })
    if (!purchase) throw new BookingCreationError('Package purchase not found', 404)
    const terms = packagePurchaseTermsSchema.safeParse(purchase.terms)
    if (!terms.success) throw new BookingCreationError('Package terms need support review.', 409)
    let hold: string | null = null
    const held = await readPackageReviewHolds(tx, [purchase.id])
    try { requireCreditPayment(purchase, held.has(purchase.id)) }
    catch (error) { if (error instanceof BookingCreationError) hold = error.message; else throw error }
    const validity = packageValidity(terms.data, purchase.paymentReceipt?.paidAt ?? null)
    const [clock] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`
    if (!hold && (!validity || validity.startsAt > clock.now || validity.expiresAt <= clock.now)) hold = 'Package credits are not currently valid.'
    const zone = canonicalTimeZone(purchase.trainerProfile.timeZone)
    if (!hold && !zone) hold = 'Trainer schedule time zone needs correction.'
    const services = await tx.serviceOffering.findMany({ where: { id: { in: terms.data.items.map(item => item.serviceOfferingId) } }, include: creditServiceInclude })
    const children = await tx.athleteProfile.findMany({ where: { parentProfileId: purchase.parentProfileId }, orderBy: { firstName: 'asc' }, include: { sports: true } })
    return { purchaseId: purchase.id, title: terms.data.title, expiresAt: validity?.expiresAt.toISOString() ?? null, hold,
      trainerName: `${purchase.trainerProfile.firstName} ${purchase.trainerProfile.lastName}`.trim(), timeZone: zone,
      services: terms.data.items.map(item => {
        const service = services.find(service => service.id === item.serviceOfferingId)
        const grant = purchase.creditGrants.find(grant => grant.serviceOfferingId === item.serviceOfferingId)
        const serviceHold = hold || (!creditServiceAvailable(service, purchase.trainerProfileId, item) ? 'Purchased service is unavailable or changed.' :
          !grant || grant.sessionsCount !== item.sessionsCount ? 'Session credits need support review.' : null)
        return { id: item.serviceOfferingId, title: item.title, sportId: item.sportId, durationMinutes: item.durationMinutes,
          availableCredits: serviceHold ? 0 : Math.max(0, grant!.sessionsCount - grant!._count.redemptions), hold: serviceHold }
      }),
      athletes: children.map(child => ({ id: child.id, name: `${child.firstName} ${child.lastName}`, sportIds: child.sports.map(sport => sport.sportId) })),
      slots: purchase.trainerProfile.availabilitySlots.map(slot => ({ ...slot, specificDate: slot.specificDate?.toISOString() ?? null })),
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
}
