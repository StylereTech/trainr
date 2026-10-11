import { expect, test } from './fixtures/local-auth'

test.skip(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(process.env.BASE_URL || '') || !process.env.LOCAL_E2E_SECRET, 'Requires disposable loopback fixtures.')
test.use({ channel: process.env.LOCAL_E2E_CHANNEL || undefined })

for (const width of [1440, 390]) for (const role of ['ANONYMOUS', 'PARENT', 'TRAINER', 'ADMIN'] as const) {
  test.describe(`${role} navigation ${width}px`, () => {
    test.use({ viewport: { width, height: 1000 } })
    test('exposes single links and supports keyboard activation', async ({ page, localAuth }, testInfo) => {
      if (role !== 'ANONYMOUS') await localAuth.signIn(await localAuth.create(role))
      await page.goto('/browse')
      const header = page.getByRole('banner')
      if (role !== 'ANONYMOUS') await expect(header.getByRole('link', { name: 'Notifications', exact: true })).toBeVisible()
      if (width < 1280) await header.getByRole('button', { name: 'Open navigation', exact: true }).click()
      const name = role === 'ANONYMOUS' ? 'Sign In' : 'Dashboard'
      const destination = role === 'ANONYMOUS' ? '/auth/signin' : role === 'ADMIN' ? '/admin' : `/${role.toLowerCase()}/dashboard`
      const link = header.getByRole('link', { name, exact: true }).filter({ visible: true })
      await expect(link).toHaveCount(1)
      await expect(link).toHaveAttribute('href', destination)
      await expect(header.locator('a button, button a, a a')).toHaveCount(0)
      await link.focus()
      await expect(link).toBeFocused()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath('navigation-controls.png') })
      await page.keyboard.press('Tab')
      expect(await link.evaluate(element => element.contains(document.activeElement))).toBe(false)
      await link.focus()
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(new RegExp(`${destination}$`))
      if (width < 1280) await expect(header.getByRole('button', { name: 'Open navigation', exact: true })).toHaveAttribute('aria-expanded', 'false')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath('navigation-destination.png') })
    })
  })
}
