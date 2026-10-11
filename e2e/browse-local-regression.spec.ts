import { expect, test } from '@playwright/test'

const origin = process.env.BASE_URL || ''
test.skip(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin), 'Local mocked browse regression only.')
test.use({ channel: process.env.LOCAL_E2E_CHANNEL || undefined })

const trainer = (firstName: string) => ({
  id: firstName, slug: firstName.toLowerCase(), firstName, lastName: 'Coach',
  headline: null, city: 'Dallas', state: 'TX', avgRating: 4.5, totalReviews: 2,
  totalSessions: 3, locationType: 'IN_PERSON', sports: [], specialties: [],
  serviceOfferings: [{ priceInCents: 2500, durationMinutes: 60 }], assets: [], featured: false,
})
const results = (name: string) => ({ trainers: [trainer(name)], pagination: { total: 1 } })

for (const width of [1440, 390]) {
  test.describe(`browse ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })
    test.beforeEach(async ({ page }) => {
      await page.route('**/api/auth/session', route => route.fulfill({ json: {
        user: { id: 'synthetic-parent', role: 'PARENT' }, expires: '2099-01-01',
      } }))
    })

    for (const failure of ['http', 'malformed'] as const) {
      test(`${failure} failure is not an empty catalog and can be retried`, async ({ page }, testInfo) => {
        let requests = 0
        await page.route('**/api/trainers?**', route => {
          requests++
          if (requests === 1) return failure === 'http'
            ? route.fulfill({ status: 503, json: { error: 'Unavailable' } })
            : route.fulfill({ json: { trainers: [], pagination: { total: 'wrong' } } })
          return route.fulfill({ json: results('Recovered') })
        })
        await page.goto('/browse')
        await expect(page.getByRole('alert').filter({ hasText: 'Trainer search is unavailable' })).toBeVisible()
        await expect(page.getByRole('heading', { name: 'No trainers found' })).toHaveCount(0)
        await expect(page.getByText('0 trainers found', { exact: true })).toHaveCount(0)
        await page.getByRole('button', { name: 'Retry search', exact: true }).click()
        await expect(page.getByRole('link', { name: "View Recovered Coach's trainer profile" })).toBeVisible()
        expect(requests).toBe(2)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.screenshot({ path: testInfo.outputPath(`browse-${failure}.png`) })
      })
    }

    test('Explore searches again; filters have names and clear completely', async ({ page }, testInfo) => {
      const requests: URL[] = []
      await page.route('**/api/trainers?**', route => {
        requests.push(new URL(route.request().url()))
        return route.fulfill({ json: { trainers: [], pagination: { total: 0 } } })
      })
      await page.goto('/browse')
      await expect(page.getByRole('heading', { name: 'No trainers found' })).toBeVisible()
      const before = requests.length
      await page.getByRole('button', { name: 'Explore', exact: true }).click()
      await expect.poll(() => requests.length).toBe(before + 1)
      await page.getByRole('button', { name: /^Filters/ }).click()
      for (const name of ['State', 'Sport', 'Session Type', 'Min Rating', 'Sort By']) {
        await expect(page.getByRole('combobox', { name, exact: true })).toBeVisible()
      }
      await page.getByRole('button', { name: 'Remove state filter', exact: true }).click()
      await expect.poll(() => requests.at(-1)?.searchParams.has('state')).toBe(false)
      await page.getByRole('button', { name: /Soccer/, exact: false }).click()
      await expect(page.getByRole('button', { name: /Soccer/, exact: false })).toHaveAttribute('aria-pressed', 'true')
      await page.getByRole('button', { name: 'Remove sport filter', exact: true }).click()
      await page.getByRole('combobox', { name: 'State', exact: true }).click()
      await page.getByRole('option', { name: 'Texas', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Remove state filter' })).toBeVisible()
      await page.getByRole('button', { name: 'Reset search', exact: true }).click()
      await expect.poll(() => requests.at(-1)?.searchParams.has('state')).toBe(false)
      await expect(page.getByRole('button', { name: /^Remove .* filter$/ })).toHaveCount(0)
      if (width < 1280) await page.getByRole('button', { name: 'Open navigation' }).click()
      await expect(page.getByRole('banner').getByRole('link', { name: 'Messages', exact: true })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath('browse-controls.png') })
    })

    test('a superseded slow response cannot replace current results', async ({ page }) => {
      let releaseOld!: () => void
      const oldResponse = new Promise<void>(resolve => { releaseOld = resolve })
      let oldRequested = false
      let oldAborted = false
      page.on('requestfailed', request => {
        const url = new URL(request.url())
        if (url.pathname === '/api/trainers' && !url.searchParams.has('sport')) oldAborted = true
      })
      await page.route('**/api/trainers?**', async route => {
        if (!new URL(route.request().url()).searchParams.has('sport')) {
          oldRequested = true
          await oldResponse
          await route.fulfill({ json: results('Outdated') }).catch(() => {})
        } else {
          await route.fulfill({ json: results('Current') })
        }
      })
      await page.goto('/browse', { waitUntil: 'domcontentloaded' })
      await expect.poll(() => oldRequested).toBe(true)
      await page.getByRole('button', { name: /Soccer/, exact: false }).click()
      await expect(page.getByRole('link', { name: "View Current Coach's trainer profile" })).toBeVisible()
      releaseOld()
      await expect.poll(() => oldAborted).toBe(true)
      await expect(page.getByRole('link', { name: "View Outdated Coach's trainer profile" })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Explore', exact: true })).toBeEnabled()
    })
  })
}
