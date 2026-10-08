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
        catalog: [
          { id: 'sport-basketball', slug: 'basketball', name: 'Basketball', icon: null, isActive: true, specialties: [{ id: 'spec-shooting', slug: 'shooting', name: 'Shooting' }] },
          { id: 'sport-football', slug: 'football', name: 'Football', icon: null, isActive: true, specialties: [{ id: 'db-QB-ID', slug: 'qb-training', name: 'QB Training' }] },
        ],
        revision: '2026-10-01T00:00:00.000Z',
        profile: { firstName: 'Test', lastName: 'Trainer', headline: '', bio: '', phone: '', yearsExperience: 1,
          locationType: 'BOTH', address: '', city: 'Austin', state: 'TX', zipCode: '', travelRadius: 25,
          slug: 'local-trainer', email: 'trainer@example.test', approvalStatus: 'APPROVED', stripeOnboardingComplete: false },
        sports: ['basketball'], specialties: ['spec-shooting'], certifications: [{ id: 'verified-cert', name: 'Coaching Certificate', issuingOrg: 'Example Org', credentialId: 'C-123', isVerified: true }],
        services: [{ id: 'old-service', sportId: 'sport-basketball', title: 'Fixture session', description: '', durationMinutes: 60, priceInCents: 6000, type: 'INDIVIDUAL', maxParticipants: 1 }],
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
        expect(body.specialties).toEqual(saves === 1 ? ['spec-shooting', 'db-QB-ID'] : ['spec-shooting'])
        expect(body.certifications).toEqual([{ id: 'verified-cert', name: 'Coaching Certificate', issuingOrg: 'Example Org', credentialId: 'C-123' }])
        expect(body.services[0].id).toBe(saves === 1 ? 'old-service' : 'saved-version')
        expect(body.services[0].sportId).toBe(saves === 1 ? 'sport-football' : 'sport-basketball')
        if (saves === 3) return route.fulfill({ status: 409, json: { error: 'Profile changed elsewhere. Reload required.' } })
        if (saves === 2) {
          expect(body.availability).toEqual([{ dayOfWeek: 1, startTime: '09:00', endTime: '11:00' }, { dayOfWeek: 1, startTime: '13:00', endTime: '17:00' }])
        }
        fixture = { ...fixture, sports: body.sports, specialties: body.specialties, services: [{ ...body.services[0], id: 'saved-version' }], availability: body.availability,
          revision: `2026-10-01T00:00:0${saves}.000Z` }
        return route.fulfill({ json: { success: true, specialties: fixture.specialties, services: fixture.services, certifications: fixture.certifications, revision: fixture.revision } })
      })
      await page.goto('/trainer/profile')
      await page.getByRole('button', { name: 'Football', exact: true }).click()
      await page.getByRole('button', { name: 'QB Training (Football)', exact: true }).click()
      await page.getByRole('button', { name: 'Services', exact: true }).click()
      await expect(page.getByRole('combobox', { name: 'Service 1 sport' })).toContainText('Basketball')
      await page.getByRole('combobox', { name: 'Service 1 sport' }).click()
      await page.getByRole('option', { name: 'Football', exact: true }).click()
      await page.getByPlaceholder('e.g. Private Football Session').fill('Revised session')
      await page.screenshot({ path: testInfo.outputPath('service-sport.png'), fullPage: true })
      await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
      await expect(page.getByText('Your changes have been saved successfully.', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Personal Info', exact: true }).click()
      await page.getByRole('button', { name: 'Football', exact: true }).click()
      await expect(page.getByRole('button', { name: 'QB Training (Football)', exact: true })).toHaveCount(0)
      await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
      await expect(page.getByText('Choose an active sport you coach for every service.', { exact: true })).toBeVisible()
      expect(saves).toBe(1)
      await expect(page.getByRole('combobox', { name: 'Service 1 sport' })).toContainText('Choose sport')
      await page.getByRole('combobox', { name: 'Service 1 sport' }).click()
      await expect(page.getByRole('option', { name: 'Football', exact: true })).toHaveCount(0)
      await page.getByRole('option', { name: 'Basketball', exact: true }).click()
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
