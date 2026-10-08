import { expect, test } from '@playwright/test'
import { encode } from 'next-auth/jwt'

const origin = process.env.BASE_URL || ''
const secret = process.env.LOCAL_E2E_SECRET || ''
test.skip(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin) || !secret, 'Local synthetic catalog fixture only.')
test.use({ channel: process.env.LOCAL_E2E_CHANNEL || undefined })

for (const width of [1440, 390]) {
  test.describe(`trainer catalog ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })
    for (const empty of [false, true]) {
      test(empty ? 'shows an empty catalog without inventing selectable sports' : 'uses database specialty labels and clears choices on sport removal', async ({ page, context }, testInfo) => {
        const token = await encode({ secret, token: { sub: 'local-trainer', email: 'trainer@example.test', role: 'TRAINER' } })
        await context.addCookies([{ name: 'next-auth.session-token', value: token, url: origin }])
        const catalog = empty ? [] : [
          { id: 'football', slug: 'football', name: 'Football', icon: null, isActive: true, specialties: [{ id: 'db-QB-ID', slug: 'qb-training', name: 'QB Training' }] },
          { id: 'old', slug: 'old', name: 'Retired Sport', icon: null, isActive: false, specialties: [] },
        ]
        await page.route('**/api/**', async (route) => {
          const path = new URL(route.request().url()).pathname
          if (path === '/api/auth/session') return route.fulfill({ json: { user: { id: 'local-trainer', role: 'TRAINER' }, expires: '2099-01-01' } })
          if (path === '/api/trainer/onboarding') return route.fulfill({ json: { catalog, minServicePriceInCents: 1500 } })
          return route.fulfill({ json: {} })
        })
        await page.goto('/trainer/onboarding')
        const next = page.getByRole('button', { name: 'Next', exact: true })
        await expect(next).toBeDisabled()
        if (empty) {
          await expect(page.getByText('No sports are currently available.', { exact: true })).toBeVisible()
          await expect(page.getByRole('button', { name: 'Football', exact: true })).toHaveCount(0)
        } else {
          await expect(page.getByRole('button', { name: 'Retired Sport', exact: true })).toHaveCount(0)
          await page.getByRole('button', { name: 'Football', exact: true }).click()
          await expect(page.getByRole('button', { name: 'Football', exact: true })).toHaveAttribute('aria-pressed', 'true')
          await expect(page.getByRole('button', { name: 'Football', exact: true })).toHaveCSS('color', 'rgb(5, 46, 22)')
          await page.getByRole('button', { name: 'QB Training (Football)', exact: true }).click()
          await expect(next).toBeEnabled()
          await page.getByRole('button', { name: 'Football', exact: true }).click()
          await expect(next).toBeDisabled()
          await page.getByRole('button', { name: 'Football', exact: true }).click()
          await expect(next).toBeDisabled()
          await page.getByRole('button', { name: 'QB Training (Football)', exact: true }).click()
          await expect(next).toBeEnabled()
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await expect(page.getByRole('heading', { name: 'Sports', exact: true, level: 2 })).toHaveCSS('color', 'rgb(17, 24, 39)')
        await page.screenshot({ path: testInfo.outputPath('catalog.png') })
      })
    }
  })
}
