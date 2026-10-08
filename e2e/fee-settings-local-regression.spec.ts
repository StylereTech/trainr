import { expect, test } from './fixtures/local-auth'

const origin = process.env.BASE_URL || ''
const secret = process.env.LOCAL_E2E_SECRET || ''
test.skip(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin) || !secret, 'Local synthetic admin fixture only.')
test.use({ channel: process.env.LOCAL_E2E_CHANNEL || undefined })

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test.describe(`fee settings ${viewport.width}px`, () => {
    test.use({ viewport })
    test('recovers load failure, saves a revision and prevents stale overwrite', async ({ page, localAuth }, testInfo) => {
      await localAuth.signIn(await localAuth.create('ADMIN'))
      const defaults = { platformCommissionPercent: 15, stripeFeePercent: 2.9, processingFeeCents: 30, minBookingAmountCents: 1500 }
      let active: any = null
      let failLoad = true
      let saves = 0
      await page.route('**/api/**', async (route) => {
        const path = new URL(route.request().url()).pathname
        if (path === '/api/auth/session') return route.fulfill({ json: { user: { id: 'local-admin', role: 'ADMIN' }, expires: '2099-01-01' } })
        if (path !== '/api/admin/settings') return route.fulfill({ json: {} })
        if (route.request().method() === 'GET') {
          if (failLoad) { failLoad = false; return route.fulfill({ status: 503, json: { error: 'Fixture settings unavailable.' } }) }
          return route.fulfill({ json: { active, configs: active ? [active] : [], defaults } })
        }
        saves++
        const body = route.request().postDataJSON()
        if (saves === 1) {
          expect(body).toEqual({ ...defaults, platformCommissionPercent: 20, expectedConfigId: null })
          active = { id: 'config-first', ...defaults, platformCommissionPercent: 20, isActive: true, effectiveDate: '2026-10-08T00:00:00Z' }
          return route.fulfill({ status: 201, json: active })
        }
        expect(body.expectedConfigId).toBe('config-first')
        active = { ...active, id: 'config-other', platformCommissionPercent: 30 }
        return route.fulfill({ status: 409, json: { error: 'Fee settings changed. Reload before saving.' } })
      })
      await page.goto('/admin/settings')
      await expect(page.getByRole('alert').filter({ hasText: 'Fixture settings unavailable.' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Save configuration' })).toHaveCount(0)
      await page.getByRole('button', { name: 'Retry', exact: true }).click()
      await expect(page.getByLabel('Platform commission (%)')).toHaveValue('15')
      await page.getByLabel('Platform commission (%)').fill('20')
      await page.getByRole('button', { name: 'Save configuration' }).click()
      await expect(page.getByText('Settings saved', { exact: true })).toBeVisible()
      await expect(page.getByText('20% commission', { exact: true })).toBeVisible()
      await page.getByLabel('Platform commission (%)').fill('25')
      await page.getByRole('button', { name: 'Save configuration' }).click()
      await expect(page.getByRole('button', { name: 'Save configuration' })).toBeDisabled()
      await page.getByRole('button', { name: 'Reload', exact: true }).click()
      await expect(page.getByLabel('Platform commission (%)')).toHaveValue('30')
      await expect(page.getByRole('button', { name: 'Save configuration' })).toBeEnabled()
      expect(saves).toBe(2)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath('fee-settings.png'), fullPage: true })
    })
  })
}
