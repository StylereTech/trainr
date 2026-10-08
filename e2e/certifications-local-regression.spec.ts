import { expect, test } from '@playwright/test'
import { encode } from 'next-auth/jwt'

const origin = process.env.BASE_URL || ''
const secret = process.env.LOCAL_E2E_SECRET || ''
test.skip(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin) || !secret, 'Local synthetic trainer fixture only.')
test.use({ channel: process.env.LOCAL_E2E_CHANNEL || undefined })

for (const width of [1440, 390]) {
  test.describe(`certifications ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })
    test('preserves credentials, adopts new IDs and clears edited verification', async ({ page, context }, testInfo) => {
      const token = await encode({ secret, token: { sub: 'local-trainer', email: 'trainer@example.test', role: 'TRAINER' } })
      await context.addCookies([{ name: 'next-auth.session-token', value: token, url: origin }])
      let fixture = {
        catalog: [{ id: 'sport', slug: 'basketball', name: 'Basketball', icon: null, isActive: true, specialties: [{ id: 'spec-shooting', slug: 'shooting', name: 'Shooting' }] }],
        revision: '2026-10-01T00:00:00.000Z', minServicePriceInCents: 1500,
        profile: { firstName: 'Test', lastName: 'Trainer', headline: '', bio: '', phone: '', yearsExperience: 1,
          locationType: 'BOTH', address: '', city: 'Austin', state: 'TX', zipCode: '', travelRadius: 25,
          slug: 'local-trainer', email: 'trainer@example.test', approvalStatus: 'APPROVED', stripeOnboardingComplete: false },
        sports: ['basketball'], specialties: ['spec-shooting'],
        services: [{ id: 'service', title: 'Fixture session', description: '', durationMinutes: 60, priceInCents: 6000, type: 'INDIVIDUAL', maxParticipants: 1 }],
        availability: [],
        certifications: [{ id: 'verified-cert', name: 'Coaching Certificate', issuingOrg: 'Example Org', credentialId: 'C-123', isVerified: true }],
      }
      let saves = 0
      await page.route('**/api/**', async (route) => {
        const path = new URL(route.request().url()).pathname
        if (path === '/api/auth/session') return route.fulfill({ json: { user: { id: 'local-trainer', role: 'TRAINER' }, expires: '2099-01-01' } })
        if (path !== '/api/trainer/onboarding') return route.fulfill({ json: {} })
        if (route.request().method() === 'GET') return route.fulfill({ json: fixture })
        const body = route.request().postDataJSON()
        expect(body.revision).toBe(fixture.revision)
        saves++
        expect(body.certifications[0]).toMatchObject({ id: 'verified-cert', credentialId: saves === 1 ? 'C-123' : 'C-456' })
        expect(body.certifications.every((cert: any) => !('isVerified' in cert))).toBe(true)
        if (saves === 2) expect(body.certifications[1].id).toBeUndefined()
        if (saves === 3) expect(body.certifications[1].id).toBe('new-cert')
        if (saves === 4) expect(body.certifications).toHaveLength(1)
        fixture = { ...fixture, revision: `2026-10-01T00:00:0${saves}.000Z`, certifications: body.certifications.map((cert: any, i: number) => ({ ...cert, id: cert.id || 'new-cert', isVerified: i === 0 && saves === 1 })) }
        return route.fulfill({ json: { success: true, specialties: fixture.specialties, services: fixture.services, certifications: fixture.certifications, revision: fixture.revision } })
      })
      await page.goto('/trainer/profile')
      await expect(page.getByLabel('Certification 1 credential ID')).toHaveValue('C-123')
      await expect(page.getByText('Verified', { exact: true })).toBeVisible()
      const save = async (count: number) => {
        await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
        await expect.poll(() => saves).toBe(count)
        await expect(page.getByRole('button', { name: 'Save Changes', exact: true })).toBeEnabled()
      }
      await save(1)
      await expect(page.getByText('Verified', { exact: true })).toBeVisible()
      await page.getByLabel('Certification 1 credential ID').fill('C-456')
      await expect(page.getByText('Not verified', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Add', exact: true }).click()
      await page.getByLabel('Certification 2 name').fill('New Credential')
      await save(2)
      await save(3)
      await page.getByRole('button', { name: 'Remove certification 2', exact: true }).click()
      await save(4)
      await page.reload()
      const credential = page.getByLabel('Certification 1 credential ID')
      await expect(credential).toHaveValue('C-456')
      await expect(page.getByText('Not verified', { exact: true })).toBeVisible()
      await expect(page.getByLabel('Certification 2 name')).toHaveCount(0)
      await credential.scrollIntoViewIfNeeded()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath('certification-editor.png') })
    })
  })
}
