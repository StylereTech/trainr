import { randomUUID } from 'node:crypto'
import { expect, test } from './fixtures/local-auth'

test.skip(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(process.env.BASE_URL || '') || !process.env.LOCAL_E2E_SECRET, 'Local disposable database and synthetic sessions only.')
test.use({ channel: process.env.LOCAL_E2E_CHANNEL || undefined })

for (const width of [1440, 390]) {
  test.describe(`trainer time zone ${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, timezoneId: 'Pacific/Honolulu' })
    for (const entry of ['onboarding', 'profile']) {
      test(`${entry} requires an explicit zone and preserves it after refresh`, async ({ page, localAuth }, testInfo) => {
        const db = localAuth.database
        const user = await localAuth.create('TRAINER')
        const sport = await db.sport.create({ data: { name: 'Synthetic Basketball', slug: randomUUID(), specialties: { create: { name: 'Shooting', slug: 'shooting' } } }, include: { specialties: true } })
        try {
          await localAuth.signIn(user)
          if (entry === 'profile') {
            await db.trainerProfile.update({ where: { userId: user.id }, data: {
              sports: { create: { sportId: sport.id } }, specialties: { create: { specialtyId: sport.specialties[0].id } },
              serviceOfferings: { create: { title: 'Synthetic session', sportId: sport.id, durationMinutes: 60, priceInCents: 6000 } },
              availabilitySlots: { create: { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' } },
            } })
          }
          await page.goto(`/trainer/${entry}`)
          const next = page.getByRole('button', { name: 'Next', exact: true })
          if (entry === 'onboarding') {
            await page.getByRole('button', { name: 'Synthetic Basketball', exact: true }).click()
            await page.getByRole('button', { name: 'Shooting (Synthetic Basketball)', exact: true }).click()
            await next.click()
            await page.locator('main input').nth(0).fill('Synthetic')
            await page.locator('main input').nth(1).fill('Trainer')
            await page.getByPlaceholder('Tell parents about yourself, your coaching philosophy, and experience...').fill('Synthetic time zone test profile')
            await next.click()
            await page.getByPlaceholder('e.g. 1-on-1 Quarterback Training').fill('Synthetic session')
            await page.getByRole('combobox', { name: 'Service 1 sport' }).click()
            await page.getByRole('option', { name: 'Synthetic Basketball', exact: true }).click()
            await next.click()
            await page.getByRole('button', { name: 'Monday', exact: true }).click()
            await expect(next).toBeDisabled()
            await expect(page.getByRole('button', { name: 'Monday', exact: true })).toHaveCSS('color', 'rgb(5, 46, 22)')
            await expect(page.getByLabel('Monday start time', { exact: true })).toHaveCSS('color-scheme', 'dark')
            await expect(page.getByLabel('Monday end time', { exact: true })).toHaveCSS('color-scheme', 'dark')
          } else {
            await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
            await expect(page.getByText('Choose a valid schedule time zone.', { exact: true })).toBeVisible()
          }
          const zone = page.getByLabel('Schedule time zone *', { exact: true })
          await expect(zone).toHaveValue('')
          expect((await db.trainerProfile.findUniqueOrThrow({ where: { userId: user.id } })).timeZone).toBeNull()
          await zone.selectOption('America/Chicago')
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
          const box = await zone.boundingBox()
          expect(box!.x).toBeGreaterThanOrEqual(0)
          expect(box!.x + box!.width).toBeLessThanOrEqual(width)
          await page.screenshot({ path: testInfo.outputPath('schedule-zone.png'), fullPage: true })
          if (entry === 'onboarding') {
            await next.click()
            await expect(page.getByText('America/Chicago', { exact: false })).toBeVisible()
            await page.getByRole('button', { name: 'Submit Profile', exact: true }).click()
            await expect(page).toHaveURL(/\/trainer\/dashboard$/)
          } else {
            await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
            await expect(page.getByText('Your changes have been saved successfully.', { exact: true })).toBeVisible()
          }
          expect((await db.trainerProfile.findUniqueOrThrow({ where: { userId: user.id } })).timeZone).toBe('America/Chicago')
          await page.goto('/trainer/profile?tab=availability')
          await expect(zone).toHaveValue('America/Chicago')
          await expect(page.getByLabel('Monday window 1 start time')).toHaveValue('09:00')
          await expect(page.getByLabel('Monday window 1 start time')).toHaveCSS('color-scheme', 'dark')
          await expect(page.getByLabel('Monday window 1 end time')).toHaveCSS('color-scheme', 'dark')
          await zone.selectOption('UTC')
          await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
          await expect(page.getByText('Your changes have been saved successfully.', { exact: true })).toBeVisible()
          await page.reload()
          await expect(zone).toHaveValue('UTC')
          await expect(page.getByLabel('Monday window 1 end time')).toHaveValue('17:00')
          expect((await db.trainerProfile.findUniqueOrThrow({ where: { userId: user.id } })).timeZone).toBe('UTC')
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
          await page.screenshot({ path: testInfo.outputPath('zone-readback.png'), fullPage: true })
        } finally {
          await db.user.deleteMany({ where: { id: user.id } })
          await db.sport.deleteMany({ where: { id: sport.id } })
        }
      })
    }
  })
}
