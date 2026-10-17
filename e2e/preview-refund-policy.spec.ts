import { expect, test } from '@playwright/test'

const previewUrl = 'https://trainr-git-codex-payment-readiness-20261006-styleres-projects.vercel.app'

test.use({ channel: process.env.LOCAL_E2E_CHANNEL || (process.platform === 'win32' ? 'chrome' : 'chromium') })
test.skip(process.env.TRAINR_PREVIEW_REFUND_POLICY !== '1', 'Run only against the isolated TRAINR Preview')

test('manual refund policy is visible and support can be contacted', async ({ page }) => {
  expect(process.env.BASE_URL).toBe(previewUrl)
  await page.goto('/legal/refunds')
  await expect(page.getByRole('heading', { level: 1, name: 'Refund Policy' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Requesting a Refund' })).toBeVisible()
  await expect(page.getByText('Cash refunds and promotional discount codes are handled by our support team', { exact: false })).toBeVisible()
  await expect(page.getByRole('link', { name: 'support@trainr.app' }).first()).toHaveAttribute('href', 'mailto:support@trainr.app')
  await expect(page.getByRole('cell', { name: 'At least 24 hours' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Under 24 hours' })).toBeVisible()
  await expect(page.getByText('one-use 10% discount code', { exact: false })).toBeVisible()
  await expect(page.getByText('A pending or failed refund is not a completed refund.', { exact: false })).toBeVisible()
  await expect(page.locator('body')).not.toContainText('full refund automatically')
  await expect(page.locator('body')).not.toContainText('3–5 business days')
})
