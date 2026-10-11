import { test, expect } from './fixtures/local-auth'

test.use({ channel: process.env.LOCAL_E2E_CHANNEL || 'chrome' })

for (const width of [1440, 390]) {
  for (const [tab, label] of [['services', 'Services'], ['availability', 'Availability'], ['payouts', 'Earnings & Payouts']]) {
    test(`selected profile view remains visible ${tab} ${width}px`, async ({ page, localAuth }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 })
      await localAuth.signIn(await localAuth.create('TRAINER'))
      await page.goto(`/trainer/profile?tab=${tab}`)
      const selected = page.getByRole('button', { name: label, exact: true })
      // Native horizontal scrolling can round the edge by a fraction of a pixel.
      await expect(selected).toBeInViewport({ ratio: 0.99 })
      await page.getByRole('button', { name: 'Personal Info', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Personal Info', exact: true })).toBeInViewport({ ratio: 0.99 })
      const headline = page.getByPlaceholder('e.g. Elite Quarterback Coaching', { exact: true })
      await headline.fill('Unsaved synthetic headline')
      await selected.click()
      await expect(selected).toBeInViewport({ ratio: 0.99 })
      await page.getByRole('button', { name: 'Personal Info', exact: true }).click()
      await expect(headline).toHaveValue('Unsaved synthetic headline')
      await selected.click()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath('selected-profile-view.png'), fullPage: true })
    })
  }
}
