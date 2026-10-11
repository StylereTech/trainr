import { randomUUID } from 'node:crypto'
import { test, expect } from './fixtures/local-auth'

test.use({ channel: process.env.LOCAL_E2E_CHANNEL || 'chrome' })

for (const width of [1440, 390]) for (const timezoneId of ['America/Los_Angeles', 'Asia/Tokyo']) {
  test.describe(`booking dates ${timezoneId} ${width}px`, () => {
    test.use({ viewport: { width, height: 1000 }, timezoneId, locale: 'en-US' })
    for (const role of ['PARENT', 'TRAINER', 'ADMIN'] as const) {
      test(`${role} keeps saved calendar dates across views and refresh`, async ({ page, localAuth }, testInfo) => {
        const db = localAuth.database
        const parent = await localAuth.create('PARENT'), trainer = await localAuth.create('TRAINER')
        const actor = role === 'PARENT' ? parent : role === 'TRAINER' ? trainer : await localAuth.create('ADMIN')
        const parentProfile = await db.parentProfile.findUniqueOrThrow({ where: { userId: parent.id } })
        const trainerProfile = await db.trainerProfile.findUniqueOrThrow({ where: { userId: trainer.id } })
        const sport = await db.sport.create({ data: { name: 'Date test', slug: randomUUID() } })
        try {
          const service = await db.serviceOffering.create({ data: { trainerProfileId: trainerProfile.id, sportId: sport.id, title: 'Calendar date session', durationMinutes: 60, priceInCents: 6000 } })
          const athlete = await db.athleteProfile.create({ data: { parentProfileId: parentProfile.id, firstName: 'Synthetic', lastName: 'Athlete', dateOfBirth: new Date('2015-01-01') } })
          for (const [date, status] of [['2030-01-01', 'PENDING'], ['2030-03-10', 'PENDING'], ['2030-11-03', 'COMPLETED']] as const) {
            await db.booking.create({ data: { parentProfileId: parentProfile.id, trainerProfileId: trainerProfile.id, athleteProfileId: athlete.id,
              serviceOfferingId: service.id, date: new Date(`${date}T00:00:00.000Z`), startTime: '09:00', endTime: '10:00', status,
              totalAmountInCents: 6000, platformFeeInCents: 900, trainerPayoutInCents: 5100 } })
          }
          await localAuth.signIn(actor)
          await page.goto(role === 'ADMIN' ? '/admin' : `/${role.toLowerCase()}/dashboard`)
          for (const date of ['1/1/2030', '3/10/2030']) {
            await expect(page.getByText(role === 'ADMIN' ? `${date} at 09:00` : date, { exact: true })).toBeVisible()
          }
          await expect(page.getByText(/12\/31\/2029|3\/9\/2030/)).toHaveCount(0)
          if (role === 'ADMIN') {
            await expect(page.getByText('11/3/2030 at 09:00', { exact: true })).toBeVisible()
            await page.goto('/admin/bookings')
          } else {
            await page.getByRole('tab', { name: role === 'PARENT' ? 'Past (1)' : 'Completed (1)', exact: true }).click()
          }
          await expect(page.getByText('11/3/2030', { exact: true })).toBeVisible()
          await expect(page.getByText(/11\/2\/2030/)).toHaveCount(0)
          await page.getByText('11/3/2030', { exact: true }).scrollIntoViewIfNeeded()
          await page.screenshot({ path: testInfo.outputPath('saved-session-date.png') })
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
          await page.reload()
          await expect(page.getByText('1/1/2030', { exact: true })).toBeVisible()
          const saved = await db.booking.findMany({ where: { trainerProfileId: trainerProfile.id }, orderBy: { date: 'asc' } })
          expect(saved.map(booking => booking.date.toISOString())).toEqual(['2030-01-01T00:00:00.000Z', '2030-03-10T00:00:00.000Z', '2030-11-03T00:00:00.000Z'])
          expect(await db.payment.count({ where: { booking: { trainerProfileId: trainerProfile.id } } })).toBe(0)
        } finally {
          await db.booking.deleteMany({ where: { trainerProfileId: trainerProfile.id } })
          await db.serviceOffering.deleteMany({ where: { trainerProfileId: trainerProfile.id } })
          await db.sport.delete({ where: { id: sport.id } })
        }
      })
    }
  })
}
