import { test, expect } from './fixtures/local-auth'

test.use({ channel: process.env.LOCAL_E2E_CHANNEL || 'chrome' })
for (const width of [1440, 390]) test(`admin shell stays inside viewport ${width}px`, async ({ page, localAuth }, info) => {
  await localAuth.signIn(await localAuth.create('ADMIN'))
  await page.setViewportSize({ width, height: 1000 })
  await page.goto('/admin/checkout-closures')
  const heading = page.getByRole('heading', { name: 'Account checkout closures', exact: true })
  await expect(heading).toBeVisible()
  await page.screenshot({ path: info.outputPath('admin-layout.png'), fullPage: true })
  const bounds = await heading.evaluate(element => { const rect = element.getBoundingClientRect(); return { left: rect.left, right: rect.right } })
  expect(bounds.left).toBeGreaterThanOrEqual(16)
  expect(bounds.right).toBeLessThanOrEqual(width - 16)
  if (width === 1440) expect(await page.getByRole('complementary').evaluate(element => element.getBoundingClientRect().left)).toBeGreaterThanOrEqual(0)
  expect(await page.evaluate(() => document.body.scrollWidth <= innerWidth)).toBe(true)
})
