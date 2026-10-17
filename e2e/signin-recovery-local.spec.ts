import { expect, test } from '@playwright/test'

const local = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(process.env.BASE_URL || '')
test.skip(!local, 'Synthetic authentication responses are restricted to localhost.')
test.use({ channel: process.env.LOCAL_E2E_CHANNEL || undefined })

for (const width of [1440, 390]) {
  test.describe(`sign-in recovery ${width}px`, () => {
    test.use({ viewport: { width, height: 1000 } })

    for (const failure of ['credentials', 'session-http', 'session-empty', 'session-json', 'session-role', 'session-id']) {
      test(`${failure} stays on the form and permits retry`, async ({ page }, testInfo) => {
        let submitted = false
        let recovered = false
        const destinations: string[] = []
        await page.route('**/api/auth/**', async route => {
          const path = new URL(route.request().url()).pathname
          if (path === '/api/auth/providers') return route.fulfill({ json: { credentials: { id: 'credentials', name: 'credentials', type: 'credentials', signinUrl: '/api/auth/signin/credentials', callbackUrl: '/api/auth/callback/credentials' } } })
          if (path === '/api/auth/csrf') return route.fulfill({ json: { csrfToken: 'synthetic-local-csrf' } })
          if (path === '/api/auth/callback/credentials') {
            submitted = true
            return route.fulfill({ status: !recovered && failure === 'credentials' ? 401 : 200,
              json: { url: new URL(!recovered && failure === 'credentials' ? '/auth/signin?error=CredentialsSignin' : '/', route.request().url()).href } })
          }
          if (path === '/api/auth/session') {
            if (!submitted) return route.fulfill({ json: {} })
            if (recovered) return route.fulfill({ json: { user: { id: 'synthetic-parent', role: 'PARENT' } } })
            if (failure === 'session-http') return route.fulfill({ status: 503, json: { error: 'Synthetic outage' } })
            if (failure === 'session-json') return route.fulfill({ contentType: 'application/json', body: 'invalid json' })
            if (failure === 'session-role') return route.fulfill({ json: { user: { id: 'synthetic-parent', role: 'UNKNOWN' } } })
            if (failure === 'session-id') return route.fulfill({ json: { user: { role: 'PARENT' } } })
            return route.fulfill({ json: {} })
          }
          return route.fulfill({ status: 404, json: {} })
        })
        await page.route('**/parent/dashboard**', async route => {
          destinations.push(route.request().url())
          return route.fulfill({ contentType: 'text/html', body: '<h1>Synthetic parent destination</h1>' })
        })
        await page.goto('/auth/signin')
        await page.getByLabel('Email', { exact: true }).fill('synthetic-parent@example.test')
        await page.getByLabel('Password', { exact: true }).fill('Synthetic-local-only!')
        await page.getByRole('button', { name: 'Sign In', exact: true }).click()
        const error = page.locator('#signin-error')
        await expect(error).toBeVisible()
        await expect(error).toHaveAttribute('role', 'alert')
        await expect(page).toHaveURL(/\/auth\/signin$/)
        expect(destinations).toEqual([])
        await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeEnabled()
        await expect(page.getByLabel('Email', { exact: true })).toHaveValue('synthetic-parent@example.test')
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await error.scrollIntoViewIfNeeded()
        await page.screenshot({ path: testInfo.outputPath('signin-error.png') })
        recovered = true
        await page.getByRole('button', { name: 'Sign In', exact: true }).click()
        await expect(page).toHaveURL(/\/parent\/dashboard$/)
        expect(destinations.length).toBeGreaterThan(0)
      })
    }
  })
}
