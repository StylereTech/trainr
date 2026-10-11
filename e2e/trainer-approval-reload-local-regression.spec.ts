import { expect, test } from './fixtures/local-auth'
import { observeHydration } from './fixtures/hydration-observer'

test.skip(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(process.env.BASE_URL || '') || !process.env.LOCAL_E2E_SECRET,
  'Requires the guarded disposable loopback server.')
test.use({ channel: process.env.LOCAL_E2E_CHANNEL || 'chrome' })

for (const width of [1440, 390]) {
  test(`trainer approval preserves hydration across repeated real reloads at ${width}px`, async ({ page, localAuth }, testInfo) => {
    test.setTimeout(120000)
    await page.setViewportSize({ width, height: 900 })
    await localAuth.signIn(await localAuth.create('ADMIN'))
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => {
      if (message.type() === 'error' && /hydration|server rendered/i.test(message.text())) errors.push(message.text())
    })
    const finishDiagnostic = await observeHydration(page, testInfo)
    try {
      await page.goto('/admin/trainers')
      for (let reload = 0; reload < 10; reload++) {
        await expect(page.getByText('All caught up', { exact: true })).toBeVisible()
        await expect(page.getByRole('link', { name: 'Notifications', exact: true }).filter({ visible: true })).toBeVisible()
        expect(errors, `Initial render and reload ${reload}`).toEqual([])
        await page.reload()
      }
      await expect(page.getByText('All caught up', { exact: true })).toBeVisible()
      expect(errors).toEqual([])
    } finally { await finishDiagnostic() }
  })
}
