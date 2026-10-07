import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'

test('trainer availability time controls fit their day rows on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await loginAs(page, 'trainer')
  await page.goto('/trainer/profile')
  await page.getByRole('button', { name: 'Availability', exact: true }).click()
  const fields = page.locator('input[type="time"]')
  await expect(fields.first()).toBeVisible()
  for (const field of await fields.all()) {
    await field.scrollIntoViewIfNeeded()
    const bounds = await field.evaluate((element) => {
      const row = element.closest('[data-testid^="availability-day-"]')
      if (!row) throw new Error('Availability day container is missing')
      const inner = element.getBoundingClientRect()
      const outer = row.getBoundingClientRect()
      return { left: inner.left, right: inner.right, rowLeft: outer.left, rowRight: outer.right }
    })
    expect(bounds.left).toBeGreaterThanOrEqual(bounds.rowLeft)
    expect(bounds.right).toBeLessThanOrEqual(bounds.rowRight)
    await expect(field).toHaveAttribute('aria-label', / (start|end) time$/)
  }
})
