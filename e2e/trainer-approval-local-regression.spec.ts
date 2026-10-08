import { expect, test } from '@playwright/test'
import { encode } from 'next-auth/jwt'

const origin = process.env.BASE_URL || ''
const secret = process.env.LOCAL_E2E_SECRET || ''
test.skip(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin) || !secret, 'Local synthetic administrator fixture only.')
test.use({ channel: process.env.LOCAL_E2E_CHANNEL || undefined })

for (const width of [1440, 390]) {
  test(`trainer approval handles load errors and stale decisions ${width}px`, async ({ page, context }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    const token = await encode({ secret, token: { sub: 'local-admin', email: 'admin@example.test', role: 'ADMIN' } })
    await context.addCookies([{ name: 'next-auth.session-token', value: token, url: origin }])
    const trainer = { id: 'trainer', firstName: 'Synthetic', lastName: 'Coach', slug: 'fixture', headline: 'Initial profile', bio: 'Synthetic coaching experience.',
      yearsExperience: 4, locationType: 'BOTH', city: 'Austin', state: 'TX', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-08T00:00:00.000Z',
      sports: [{ sport: { name: 'Basketball', icon: '' } }], user: { email: 'trainer@example.test', createdAt: '2026-10-01T00:00:00.000Z' } }
    let failLoad = true
    let pending = true
    let decisions = 0
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname
      if (path === '/api/auth/session') return route.fulfill({ json: { user: { id: 'local-admin', role: 'ADMIN' }, expires: '2099-01-01' } })
      if (path === '/api/admin') {
        if (failLoad) { failLoad = false; return route.fulfill({ status: 503, json: {} }) }
        return route.fulfill({ json: { trainers: pending ? [trainer] : [] } })
      }
      if (path === '/api/admin/trainers/trainer') {
        decisions++
        const body = route.request().postDataJSON()
        if (decisions === 1) {
          expect(body).toEqual({ action: 'approve', revision: trainer.updatedAt })
          trainer.updatedAt = '2026-10-08T01:00:00.000Z'
          trainer.headline = 'Changed since review'
          return route.fulfill({ status: 409, json: { error: 'Trainer profile changed. Reload and review it before applying this decision.' } })
        }
        expect(body).toEqual({ action: 'reject', reason: 'Please complete your profile.', revision: trainer.updatedAt })
        pending = false
        return route.fulfill({ json: { ...trainer, approvalStatus: 'REJECTED' } })
      }
      return route.fulfill({ json: {} })
    })
    await page.goto('/admin/trainers')
    await expect(page.getByRole('alert').filter({ hasText: 'Unable to load trainer applications.' })).toBeVisible()
    await expect(page.getByText('All caught up', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect(page.getByText('Initial profile', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Approve', exact: true }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Trainer profile changed.' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Reject', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Reload', exact: true }).click()
    await expect(page.getByText('Changed since review', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'View', exact: true }).click()
    await expect(page.getByRole('dialog')).toContainText('Changed since review')
    await page.getByRole('dialog').getByRole('button', { name: 'Reject', exact: true }).click()
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Reject', exact: true })).toBeDisabled()
    await page.getByLabel('Rejection reason').fill('Please complete your profile.')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('review-decision.png'), fullPage: true })
    await page.getByRole('dialog').getByRole('button', { name: 'Reject', exact: true }).click()
    await expect(page.getByText('Trainer rejected', { exact: true })).toBeVisible()
    await expect(page.getByText('All caught up', { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByText('All caught up', { exact: true })).toBeVisible()
    expect(decisions).toBe(2)
    expect(errors).toEqual([])
  })

  test(`trainer approval reloads an uncertain response without repeating the write ${width}px`, async ({ page, context }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    const token = await encode({ secret, token: { sub: 'local-admin', role: 'ADMIN' } })
    await context.addCookies([{ name: 'next-auth.session-token', value: token, url: origin }])
    let pending = true
    let decisions = 0
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname
      if (path === '/api/auth/session') return route.fulfill({ json: { user: { id: 'local-admin', role: 'ADMIN' }, expires: '2099-01-01' } })
      if (path === '/api/admin') return route.fulfill({ json: { trainers: pending ? [{ id: 'trainer', firstName: 'Synthetic', lastName: 'Coach', slug: 'fixture',
        headline: 'Ready for review', bio: 'Synthetic profile.', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-08T00:00:00.000Z',
        yearsExperience: 4, locationType: 'BOTH', city: 'Austin', state: 'TX', sports: [], user: { email: 'trainer@example.test', createdAt: '2026-10-01T00:00:00.000Z' } }] : [] } })
      if (path === '/api/admin/trainers/trainer') {
        decisions++
        expect(route.request().postDataJSON()).toEqual({ action: 'approve', revision: '2026-10-08T00:00:00.000Z' })
        pending = false
        return route.abort('failed')
      }
      return route.fulfill({ json: {} })
    })
    await page.goto('/admin/trainers')
    await page.getByRole('button', { name: 'Approve', exact: true }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'The decision could not be confirmed.' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeDisabled()
    await expect(page.getByText('Trainer approved', { exact: true })).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath('uncertain-decision.png'), fullPage: true })
    await page.getByRole('button', { name: 'Reload', exact: true }).click()
    await expect(page.getByText('All caught up', { exact: true })).toBeVisible()
    expect(decisions).toBe(1)
  })
}
