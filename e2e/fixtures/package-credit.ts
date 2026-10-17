import { randomUUID } from 'node:crypto'
import type { LocalAuth } from './local-auth'
import { approvedPackageCreditPolicy } from '../../src/lib/package-purchase-schema'

// Requires the guarded, loopback-only localAuth fixture. These are synthetic SQL
// receipts and reserved sessions, not evidence of public purchase/booking creation.
export async function createLocalCreditBooking(localAuth: LocalAuth, options: { startsInMs?: number; title?: string } = {}) {
  const db = localAuth.database, key = randomUUID().replaceAll('-', '')
  const parent = await localAuth.create('PARENT'), trainer = await localAuth.create('TRAINER')
  const pp = await db.parentProfile.findUniqueOrThrow({ where: { userId: parent.id } })
  const tp = await db.trainerProfile.update({ where: { userId: trainer.id }, data: { approvalStatus: 'APPROVED', timeZone: 'UTC' } })
  const sport = await db.sport.create({ data: { name: `Credit dashboard ${key}`, slug: key } })
  const cleanup = async () => {
    await db.booking.deleteMany({ where: { trainerProfileId: tp.id } })
    await db.packagePurchase.deleteMany({ where: { trainerProfileId: tp.id } })
    await db.package.deleteMany({ where: { trainerProfileId: tp.id } })
    await db.serviceOffering.deleteMany({ where: { trainerProfileId: tp.id } })
    await db.sport.deleteMany({ where: { id: sport.id } })
  }
  try {
    await db.trainerSport.create({ data: { trainerProfileId: tp.id, sportId: sport.id } })
    const service = await db.serviceOffering.create({ data: { trainerProfileId: tp.id, sportId: sport.id, title: 'Synthetic credit session', priceInCents: 3000 } })
    const child = await db.athleteProfile.create({ data: { parentProfileId: pp.id, firstName: 'Synthetic', lastName: 'Child', dateOfBirth: new Date('2015-01-01'),
      sports: { create: { sportId: sport.id } } } })
    const catalog = await db.package.create({ data: { trainerProfileId: tp.id, title: options.title || 'Synthetic shared package', totalSessions: 2, priceInCents: 6000, validForDays: 90,
      items: { create: { serviceOfferingId: service.id, sessionsCount: 2 } } } })
    const purchase = await db.packagePurchase.create({ data: { parentProfileId: pp.id, trainerProfileId: tp.id, packageId: catalog.id,
      requestId: randomUUID(), payloadHash: 'a'.repeat(64), catalogRevision: catalog.updatedAt,
      terms: { version: 2, title: catalog.title, description: '', validForDays: 90, totalSessions: 2, creditPolicy: approvedPackageCreditPolicy,
        items: [{ serviceOfferingId: service.id, title: service.title, sportId: sport.id, durationMinutes: 60, type: 'INDIVIDUAL', sessionsCount: 2 }] },
      amountInCents: 6000, platformFeeInCents: 900, trainerPayoutInCents: 5100, status: 'SUCCEEDED', settlementVerifiedAt: new Date(),
      stripePaymentIntentId: `pi_${key}`, stripeChargeId: `ch_${key}`, stripeTransferId: `tr_${key}`, stripeCheckoutSessionId: `cs_${key}`,
      createdAt: new Date(Date.now() - 2000),
    } })
    await db.packageCreditGrant.create({ data: { purchaseId: purchase.id, serviceOfferingId: service.id, sessionsCount: 2 } })
    await db.packagePaymentReceipt.create({ data: { purchaseId: purchase.id, stripeEventId: `evt_${key}`, stripePaymentIntentId: `pi_${key}`,
      stripeChargeId: `ch_${key}`, stripeCheckoutSessionId: `cs_${key}`, livemode: false, paidAt: new Date(Date.now() - 1000) } })
    const startsAt = new Date(Date.now() + (options.startsInMs ?? 3 * 86400000)), endsAt = new Date(startsAt.getTime() + 3600000)
    const booking = await db.booking.create({ data: { parentProfileId: pp.id, trainerProfileId: tp.id, athleteProfileId: child.id, serviceOfferingId: service.id,
      date: new Date(`${startsAt.toISOString().slice(0, 10)}T00:00:00Z`), startTime: startsAt.toISOString().slice(11, 16), endTime: endsAt.toISOString().slice(11, 16),
      timeZone: 'UTC', startsAt, endsAt, status: 'CONFIRMED', totalAmountInCents: 0, platformFeeInCents: 0, trainerPayoutInCents: 0 } })
    await db.packageCreditRedemption.create({ data: { bookingId: booking.id, purchaseId: purchase.id, serviceOfferingId: service.id } })
    return { parent, trainer, purchase, booking, key, cleanup }
  } catch (error) { await cleanup(); throw error }
}
