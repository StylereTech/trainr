import { randomUUID } from 'node:crypto'
import { expect, test } from './fixtures/local-auth'

test.skip(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(process.env.BASE_URL || '') || !process.env.LOCAL_E2E_SECRET, 'Requires disposable loopback fixtures.')
test.use({ channel: process.env.LOCAL_E2E_CHANNEL || undefined, timezoneId: 'America/Los_Angeles' })

for (const width of [1440, 390]) {
  test(`admin cancellation persists and reconciles uncertainty at ${width}px`, async ({ page, localAuth }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    const admin = await localAuth.create('ADMIN'), parent = await localAuth.create('PARENT'), trainer = await localAuth.create('TRAINER')
    const db = localAuth.database
    const parentProfile = await db.parentProfile.findUniqueOrThrow({ where: { userId: parent.id } })
    const trainerProfile = await db.trainerProfile.findUniqueOrThrow({ where: { userId: trainer.id } })
    const id = randomUUID()
    const sport = await db.sport.create({ data: { name: id, slug: id } })
    const service = await db.serviceOffering.create({ data: { trainerProfileId: trainerProfile.id, sportId: sport.id, title: 'Cancellation fixture', durationMinutes: 60, priceInCents: 6000 } })
    const athlete = await db.athleteProfile.create({ data: { parentProfileId: parentProfile.id, firstName: 'Synthetic', lastName: 'Athlete', dateOfBirth: new Date('2015-01-01') } })
    try {
      const booking = await db.booking.create({ data: { parentProfileId: parentProfile.id, trainerProfileId: trainerProfile.id, athleteProfileId: athlete.id, serviceOfferingId: service.id,
        date: new Date('2030-11-04'), startTime: '09:00', endTime: '10:00', status: 'PENDING', totalAmountInCents: 6000, platformFeeInCents: 900, trainerPayoutInCents: 5100 } })
      await localAuth.signIn(admin)
      let writes = 0
      await page.route('**/api/admin/bookings', async route => {
        if (route.request().method() !== 'PATCH') return route.continue()
        writes++
        if (writes === 1) {
          expect((await route.fetch()).status()).toBe(200)
          return route.abort('failed')
        }
        return route.continue()
      })
      await page.goto('/admin/bookings')
      await page.getByRole('button', { name: 'Cancel', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Reload booking state' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
      expect((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('CANCELLED')
      expect(writes).toBe(1)
      await page.getByRole('button', { name: 'Reload booking state' }).click()
      await page.getByRole('button', { name: 'Reconcile checkout' }).click()
      await expect(page.getByText('No checkout required closure. This is not a refund receipt.', { exact: true })).toBeVisible()
      expect(await db.adminAction.count({ where: { targetId: booking.id } })).toBe(1)
      await db.payment.create({ data: { bookingId: booking.id, amountInCents: 6000, platformFeeInCents: 900, trainerPayoutInCents: 5100 } })
      await page.getByRole('button', { name: 'Reconcile checkout' }).click()
      await expect(page.getByText('Booking cancelled. Payment or checkout closure needs support review. No refund was issued by this action.', { exact: true })).toBeVisible()
      await page.reload()
      await expect(page.getByText('CANCELLED', { exact: true })).toBeVisible()
      await expect(page.getByText('11/4/2030', { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Reconcile checkout' })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath('cancelled-checkout-review.png') })
    } finally {
      await db.booking.deleteMany({ where: { trainerProfileId: trainerProfile.id } })
      await db.serviceOffering.delete({ where: { id: service.id } })
      await db.sport.delete({ where: { id: sport.id } })
    }
  })
}
