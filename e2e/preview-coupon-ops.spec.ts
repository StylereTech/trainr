import { expect, test } from '@playwright/test'

const previewUrl = 'https://trainr-git-codex-payment-readiness-20261006-styleres-projects.vercel.app'

test.use({ channel: process.env.LOCAL_E2E_CHANNEL || (process.platform === 'win32' ? 'chrome' : 'chromium') })
test.skip(process.env.TRAINR_PREVIEW_COUPON_OPS !== '1', 'Requires the approved synthetic Preview admin account')

test('admin coupon form defaults to one use without creating a code', async ({ page }) => {
  expect(process.env.BASE_URL).toBe(previewUrl)
  const email = process.env.TRAINR_TEST_ADMIN_EMAIL
  const password = process.env.TRAINR_TEST_ADMIN_PASSWORD
  expect(email).toBeTruthy()
  expect(password).toBeTruthy()
  await page.goto('/auth/signin')
  await page.getByLabel('Email').fill(email!)
  await page.getByLabel('Password').fill(password!)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page).toHaveURL(/\/admin$/)
  await page.goto('/admin/coupons')
  await page.getByRole('button', { name: 'Create coupon' }).first().click()
  await expect(page.getByRole('dialog', { name: 'Create coupon' }).getByLabel('Max uses')).toHaveValue('1')
})
