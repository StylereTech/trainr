import { expect, test } from '@playwright/test'

const origin = process.env.BASE_URL || ''
test.skip(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin), 'Local mocked public profile regression only.')
test.use({ channel: process.env.LOCAL_E2E_CHANNEL || undefined })

const trainer = {
  id: 'synthetic-coach', slug: 'audit-coach', firstName: 'Audit', lastName: 'Coach',
  headline: 'Soccer coaching', bio: 'Synthetic profile for browser tests.', city: 'Dallas', state: 'TX',
  locationType: 'IN_PERSON', travelRadius: 25, yearsExperience: 3, avgRating: 0, totalReviews: 0, totalSessions: 0,
  sports: [{ sport: { name: 'Soccer', icon: null } }], specialties: [], certifications: [],
  serviceOfferings: [], packages: [], assets: [], reviews: [], _count: { reviews: 0 },
  availabilitySlots: [{ dayOfWeek: null, startTime: '09:00', endTime: '10:00', isRecurring: false, isAvailable: true }],
}

for (const width of [1440, 390]) {
  test.describe(`public profile ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })
    test.beforeEach(async ({ page }) => {
      await page.route('**/api/auth/session', route => route.fulfill({ json: {} }))
    })
    for (const failure of ['missing', 'http', 'malformed'] as const) {
      test(`booking ${failure} trainer response stays recoverable`, async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', error => errors.push(error.message))
        let requests = 0
        let bookings = 0
        await page.route('**/api/bookings', route => { bookings++; return route.fulfill({ status: 500, json: {} }) })
        await page.route('**/api/athletes', route => route.fulfill({ json: { athletes: [] } }))
        await page.route('**/api/trainers/audit-coach', route => {
          requests++
          if (requests > 1) return route.fulfill({ json: trainer })
          if (failure === 'missing') return route.fulfill({ status: 404, json: { error: 'Trainer not found' } })
          if (failure === 'http') return route.fulfill({ status: 503, json: { error: 'Unavailable' } })
          return route.fulfill({ json: { ...trainer, serviceOfferings: null } })
        })
        await page.goto('/book/audit-coach')
        if (failure === 'missing') {
          await expect(page.getByRole('heading', { name: 'Trainer Not Found' })).toBeVisible()
          await expect(page.getByRole('link', { name: 'Browse Trainers', exact: true })).toHaveAttribute('href', '/browse')
        } else {
          await expect(page.getByRole('heading', { name: 'Trainer profile unavailable' })).toBeVisible()
          await page.getByRole('button', { name: 'Retry profile' }).click()
          await expect(page.getByRole('heading', { name: 'Book a session with Audit C.' })).toBeVisible()
          await expect(page.locator('main a button, main button a')).toHaveCount(0)
          expect(requests).toBe(2)
        }
        expect(bookings).toBe(0)
        expect(errors).toEqual([])
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      })
    }
    for (const path of ['/trainers/audit-coach', '/trainer/audit-coach']) {
      test(`${path} handles missing profile without crashing`, async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', error => errors.push(error.message))
        await page.route('**/api/trainers/audit-coach', route => route.fulfill({ status: 404, json: { error: 'Trainer not found' } }))
        await page.goto(path)
        await expect(page.getByRole('heading', { name: 'Trainer Not Found', exact: true })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Retry profile' })).toHaveCount(0)
        await expect(page.getByRole('link', { name: 'Browse Trainers', exact: true })).toHaveAttribute('href', '/browse')
        expect(errors).toEqual([])
      })

      for (const failure of ['http', 'malformed'] as const) {
        test(`${path} ${failure} failure retries and tabs remain usable`, async ({ page }, testInfo) => {
          let requests = 0
          const errors: string[] = []
          page.on('pageerror', error => errors.push(error.message))
          await page.route('**/api/trainers/audit-coach', route => {
            requests++
            if (requests === 1) return failure === 'http'
              ? route.fulfill({ status: 503, json: { error: 'Unavailable' } })
              : route.fulfill({ json: { ...trainer, sports: [{ sport: null }] } })
            return route.fulfill({ json: trainer })
          })
          await page.goto(path)
          await expect(page.getByRole('heading', { name: 'Trainer profile unavailable' })).toBeVisible()
          await expect(page.getByRole('heading', { name: 'Trainer Not Found' })).toHaveCount(0)
          await page.getByRole('button', { name: 'Retry profile' }).click()
          await expect(page.getByRole('heading', { name: 'Audit Coach', exact: true })).toBeVisible()
          expect(requests).toBe(2)
          await expect(page.getByRole('button', { name: 'Save trainer' })).toHaveCount(0)
          await page.getByRole('tab', { name: 'Services', exact: true }).click()
          await expect(page.getByText('No services published yet.', { exact: true })).toBeVisible()
          await page.getByRole('tab', { name: 'Availability', exact: true }).click()
          await expect(page.getByText('Contact trainer for availability.', { exact: true })).toBeVisible()
          await page.getByRole('tab', { name: 'Reviews (0)', exact: true }).click()
          await expect(page.getByRole('tabpanel')).toContainText('No reviews')
          await page.getByRole('tab', { name: 'Gallery', exact: true }).click()
          await expect(page.getByText('No photos uploaded yet.', { exact: true })).toBeVisible()
          await page.getByRole('tab', { name: 'About', exact: true }).click()
          await expect(page.getByRole('tabpanel')).toContainText(trainer.bio)
          await expect(page.getByRole('link', { name: 'Book Now', exact: true })).toHaveAttribute('href', '/book/audit-coach')
          await expect(page.locator('main a button, main button a')).toHaveCount(0)
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
          expect(errors).toEqual([])
          await page.screenshot({ path: testInfo.outputPath('profile-tabs.png'), fullPage: true })
          await page.getByRole('link', { name: 'Book Now', exact: true }).focus()
          await page.keyboard.press('Enter')
          await expect(page.getByRole('heading', { name: 'Book a session with Audit C.' })).toBeVisible()
        })
      }
    }

    for (const clipboardWorks of [true, false]) {
      test(`copy profile link with clipboard ${clipboardWorks ? 'available' : 'denied'}`, async ({ page }) => {
        await page.addInitScript(({ works }) => {
          Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
            writeText: async (value: string) => {
              if (!works) throw new Error('Permission denied')
              sessionStorage.setItem('test-copied-profile', value)
            },
          } })
        }, { works: clipboardWorks })
        await page.route('**/api/trainers/audit-coach', route => route.fulfill({ json: trainer }))
        await page.goto('/trainer/audit-coach')
        await page.getByRole('button', { name: 'Copy profile link', exact: true }).click()
        const canonical = `${origin}/trainers/audit-coach`
        if (clipboardWorks) {
          await expect(page.getByRole('status').filter({ hasText: 'Profile link copied.' })).toBeVisible()
          expect(await page.evaluate(() => sessionStorage.getItem('test-copied-profile'))).toBe(canonical)
        } else {
          await expect(page.getByRole('textbox', { name: 'Profile link', exact: true })).toHaveValue(canonical)
          await expect(page.getByText('Profile link copied.', { exact: true })).toHaveCount(0)
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      })
    }
  })
}
