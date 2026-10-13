import { randomUUID } from 'node:crypto'
import { test, expect } from './fixtures/local-auth'
import { approvedPackageCreditPolicy } from '../src/lib/package-purchase-schema'

test.skip(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(process.env.BASE_URL || '') || !process.env.LOCAL_E2E_SECRET, 'Requires disposable loopback fixtures.')
test.use({ channel: process.env.LOCAL_E2E_CHANNEL || undefined })

for (const scenario of ['early-parent', 'late-parent', 'late-trainer', 'admin', 'other-parent', 'premature-outcome'] as const) {
  test(`credit action HTTP: ${scenario}`, async ({ page, localAuth }) => {
    const db = localAuth.database, key = randomUUID().replaceAll('-', '')
    const parent = await localAuth.create('PARENT'), trainer = await localAuth.create('TRAINER')
    const actor = scenario === 'admin' ? await localAuth.create('ADMIN') : scenario === 'other-parent' ? await localAuth.create('PARENT') :
      scenario === 'late-trainer' || scenario === 'premature-outcome' ? trainer : parent
    const pp = await db.parentProfile.findUniqueOrThrow({ where: { userId: parent.id } })
    const tp = await db.trainerProfile.update({ where: { userId: trainer.id }, data: { approvalStatus: 'APPROVED', timeZone: 'UTC' } })
    const sport = await db.sport.create({ data: { name: `Credit actions ${key}`, slug: key } })
    try {
      await db.trainerSport.create({ data: { trainerProfileId: tp.id, sportId: sport.id } })
      const service = await db.serviceOffering.create({ data: { trainerProfileId: tp.id, sportId: sport.id, title: 'Synthetic credit session', priceInCents: 3000 } })
      const child = await db.athleteProfile.create({ data: { parentProfileId: pp.id, firstName: 'Synthetic', lastName: 'Child', dateOfBirth: new Date('2015-01-01'),
        sports: { create: { sportId: sport.id } } } })
      const catalog = await db.package.create({ data: { trainerProfileId: tp.id, title: 'Synthetic shared package', totalSessions: 2, priceInCents: 6000, validForDays: 90,
        items: { create: { serviceOfferingId: service.id, sessionsCount: 2 } } } })
      // Explicit synthetic persistence evidence, never an actual Stripe receipt.
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
      const startsAt = new Date(Date.now() + (scenario.startsWith('late') ? 3600000 : 3 * 86400000)), endsAt = new Date(startsAt.getTime() + 3600000)
      const booking = await db.booking.create({ data: { parentProfileId: pp.id, trainerProfileId: tp.id, athleteProfileId: child.id, serviceOfferingId: service.id,
        date: new Date(`${startsAt.toISOString().slice(0, 10)}T00:00:00Z`), startTime: startsAt.toISOString().slice(11, 16), endTime: endsAt.toISOString().slice(11, 16),
        timeZone: 'UTC', startsAt, endsAt, status: 'CONFIRMED', totalAmountInCents: 0, platformFeeInCents: 0, trainerPayoutInCents: 0 } })
      await db.packageCreditRedemption.create({ data: { bookingId: booking.id, purchaseId: purchase.id, serviceOfferingId: service.id } })
      await localAuth.signIn(actor)
      const action = scenario === 'premature-outcome' ? 'complete' : 'cancel'
      const response = await page.request.patch(`/api/bookings/${booking.id}`, { data: { action } })
      const expected = scenario === 'other-parent' ? 403 : scenario === 'admin' || scenario === 'premature-outcome' ? 409 : 200
      expect(response.status()).toBe(expected)
      const body = await response.json()
      expect(JSON.stringify(body)).not.toContain(`pi_${key}`)
      expect(body).not.toHaveProperty('creditRedemption')
      expect(body).not.toHaveProperty('paymentReceipt')
      const saved = await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
      const credit = await db.packageCreditRedemption.findUniqueOrThrow({ where: { bookingId: booking.id } })
      expect(saved.status).toBe(expected === 200 ? 'CANCELLED' : 'CONFIRMED')
      expect(!!credit.restoredAt).toBe(scenario === 'early-parent' || scenario === 'late-trainer')
      expect(await db.payment.count({ where: { bookingId: booking.id } })).toBe(0)
      expect(await db.walletEntry.count({ where: { bookingId: booking.id } })).toBe(0)
      if (expected === 200) {
        expect(body.checkoutClosure).toBe('not_required')
        expect((await page.request.patch(`/api/bookings/${booking.id}`, { data: { action } })).status()).toBe(200)
        expect(await db.packageCreditRedemption.findUnique({ where: { bookingId: booking.id } })).toEqual(credit)
        expect(await db.notification.count({ where: { userId: { in: [parent.id, trainer.id] } } })).toBe(2)
      } else expect(await db.notification.count({ where: { userId: { in: [parent.id, trainer.id] } } })).toBe(0)
    } finally {
      await db.booking.deleteMany({ where: { trainerProfileId: tp.id } })
      await db.packagePurchase.deleteMany({ where: { trainerProfileId: tp.id } })
      await db.package.deleteMany({ where: { trainerProfileId: tp.id } })
      await db.serviceOffering.deleteMany({ where: { trainerProfileId: tp.id } })
      await db.sport.delete({ where: { id: sport.id } })
    }
  })
}
