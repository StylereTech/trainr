import { expect, test } from '@playwright/test'

const origin = process.env.BASE_URL || ''
test.skip(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin), 'Local synthetic public trainer fixture only.')
test.use({ channel: process.env.LOCAL_E2E_CHANNEL || undefined })

for (const width of [1440, 390]) {
  test(`public trainer cards and anonymous reviews ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const trainer = {
      id: 'public-trainer', slug: 'privacy-fixture', firstName: 'Public', lastName: 'Coach', headline: 'Synthetic public coach', bio: 'Public coaching profile',
      city: 'Austin', state: 'TX', locationType: 'BOTH', travelRadius: 25, yearsExperience: 4, avgRating: 5, totalReviews: 1, totalSessions: 1, featured: false,
      sports: [{ sport: { name: 'Basketball', slug: 'basketball', icon: null } }], specialties: [{ specialty: { name: 'Shooting', slug: 'shooting' } }],
      certifications: [], assets: [], packages: [], availabilitySlots: [],
      serviceOfferings: [{ id: 'public-service', title: 'Public session', priceInCents: 6000, durationMinutes: 60, type: 'INDIVIDUAL', maxParticipants: 1, description: '' }],
      reviews: [{ id: 'public-review', rating: 5, knowledgeRating: 5, communicationRating: 5, punctualityRating: 5, comment: 'A useful coaching session.', createdAt: '2026-10-01T00:00:00.000Z' }],
      _count: { reviews: 1 },
    }
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname
      if (path === '/api/auth/session') return route.fulfill({ json: {} })
      if (path === '/api/trainers') return route.fulfill({ json: { trainers: [trainer], pagination: { page: 1, limit: 12, total: 1, totalPages: 1 } } })
      if (path === '/api/trainers/privacy-fixture') return route.fulfill({ json: trainer })
      return route.fulfill({ json: {} })
    })
    await page.goto('/browse')
    const card = page.getByTestId('trainer-card')
    await expect(card).toContainText('Public C.')
    await expect(card).toContainText('$60.00')
    await card.click()
    await expect(page).toHaveURL(/\/trainers\/privacy-fixture$/)
    for (const path of ['/trainers/privacy-fixture', '/trainer/privacy-fixture']) {
      await page.goto(path)
      await page.getByRole('tab', { name: 'Reviews (1)', exact: true }).click()
      await expect(page.getByText('Parent', { exact: true })).toBeVisible()
      await expect(page.getByText('A useful coaching session.', { exact: true })).toBeVisible()
      expect(await page.locator('main').innerText()).not.toContain('@')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath(path.startsWith('/trainers/') ? 'public-reviews.png' : 'legacy-public-reviews.png'), fullPage: true })
    }
    expect(errors).toEqual([])
  })
}
