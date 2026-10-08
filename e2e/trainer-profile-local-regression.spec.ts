import { expect, test } from '@playwright/test'
import { encode } from 'next-auth/jwt'

const origin = process.env.BASE_URL || ''
const secret = process.env.LOCAL_E2E_SECRET || ''
test.skip(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin) || !secret, 'Requires an explicit local server and synthetic auth secret.')
test.use({ channel: process.env.LOCAL_E2E_CHANNEL || undefined })

for (const width of [1440, 390]) {
  test.describe(`trainer profile ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })
    test('retains saved service IDs and edits individual weekly windows', async ({ page, context }, testInfo) => {
      const token = await encode({ secret, token: { sub: 'local-trainer', email: 'trainer@example.test', role: 'TRAINER' } })
      await context.addCookies([{ name: 'next-auth.session-token', value: token, url: origin }])
      let fixture = {
        revision: '2026-10-01T00:00:00.000Z',
        profile: { firstName: 'Test', lastName: 'Trainer', headline: '', bio: '', phone: '', yearsExperience: 1,
          locationType: 'BOTH', address: '', city: 'Austin', state: 'TX', zipCode: '', travelRadius: 25,
          slug: 'local-trainer', email: 'trainer@example.test', approvalStatus: 'APPROVED', stripeOnboardingComplete: false },
        sports: ['basketball'], specialties: ['shooting'], certifications: [],
        services: [{ id: 'old-service', title: 'Fixture session', description: '', durationMinutes: 60, priceInCents: 6000, type: 'INDIVIDUAL', maxParticipants: 1 }],
        availability: [{ dayOfWeek: 1, startTime: '09:00', endTime: '12:00' }, { dayOfWeek: 1, startTime: '13:00', endTime: '17:00' }],
      }
      let saves = 0
      await page.route('**/api/**', async (route) => {
        const path = new URL(route.request().url()).pathname
        if (path === '/api/auth/session') return route.fulfill({ json: { user: { id: 'local-trainer', role: 'TRAINER', email: 'trainer@example.test' }, expires: '2099-01-01' } })
        if (path !== '/api/trainer/onboarding') return route.fulfill({ json: {} })
        if (route.request().method() === 'GET') return route.fulfill({ json: fixture })
        const body = route.request().postDataJSON()
        saves++
        expect(body.revision).toBe(fixture.revision)
        expect(body.services[0].id).toBe(saves === 1 ? 'old-service' : 'saved-version')
        if (saves === 3) return route.fulfill({ status: 409, json: { error: 'Profile changed elsewhere. Reload required.' } })
        if (saves === 2) {
          expect(body.availability).toEqual([{ dayOfWeek: 1, startTime: '09:00', endTime: '11:00' }, { dayOfWeek: 1, startTime: '13:00', endTime: '17:00' }])
        }
        fixture = { ...fixture, services: [{ ...body.services[0], id: 'saved-version' }], availability: body.availability,
          revision: `2026-10-01T00:00:0${saves}.000Z` }
        return route.fulfill({ json: { success: true, services: fixture.services, revision: fixture.revision } })
      })
      await page.goto('/trainer/profile')
      await page.getByRole('button', { name: 'Services', exact: true }).click()
      await page.getByPlaceholder('e.g. Private Football Session').fill('Revised session')
      await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
      await expect(page.getByText('Your changes have been saved successfully.', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Availability', exact: true }).click()
      await expect(page.getByLabel('Monday window 1 start time')).toHaveValue('09:00')
      await expect(page.getByLabel('Monday window 2 start time')).toHaveValue('13:00')
      await page.getByLabel('Monday window 1 end time').fill('11:00')
      await expect(page.getByLabel('Monday window 2 end time')).toHaveValue('17:00')
      await page.getByRole('button', { name: 'Add Monday window', exact: true }).click()
      await expect(page.getByLabel('Monday window 3 start time')).toBeVisible()
      await page.getByRole('button', { name: 'Remove Monday window 3', exact: true }).click()
      const row = page.getByTestId('availability-day-1')
      await row.scrollIntoViewIfNeeded()
      for (const field of await row.locator('input[type="time"]').all()) {
        const box = await field.boundingBox()
        const outer = await row.boundingBox()
        expect(box!.x).toBeGreaterThanOrEqual(outer!.x)
        expect(box!.x + box!.width).toBeLessThanOrEqual(outer!.x + outer!.width)
      }
      await page.screenshot({ path: testInfo.outputPath('weekly-windows.png') })
      await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
      await expect.poll(() => saves).toBe(2)
      await expect(page.getByRole('button', { name: 'Save Changes', exact: true })).toBeEnabled()
      await page.reload()
      await page.getByRole('button', { name: 'Availability', exact: true }).click()
      await expect(page.getByLabel('Monday window 1 end time')).toHaveValue('11:00')
      await expect(page.getByLabel('Monday window 2 start time')).toHaveValue('13:00')
      await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
      await expect(page.getByText('Profile changed elsewhere. Reload required.', { exact: true })).toBeVisible()
    })
  })
}
