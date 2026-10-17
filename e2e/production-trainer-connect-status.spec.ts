import { expect, test } from '@playwright/test'
import { loginAs } from './helpers'

test.skip(process.env.TRAINR_PUBLIC_DEMO_STATUS !== '1', 'Requires approved public demo account access')

test('public trainer Connect status responds without a provider error', async ({ page }) => {
  await loginAs(page, 'trainer')
  await expect(page).toHaveURL(/\/trainer\/dashboard$/)

  const response = await page.request.get('/api/trainer/stripe-connect')
  expect(response.status()).toBe(200)
  const status = await response.json()
  console.log('Public Connect readiness:', JSON.stringify({
    stripeConfigured: status.stripeConfigured,
    hasAccount: status.hasAccount,
    chargesEnabled: status.chargesEnabled,
    transfersEnabled: status.transfersEnabled,
    payoutsEnabled: status.payoutsEnabled,
    onboardingComplete: status.onboardingComplete,
    error: status.error,
  }))
  expect(status.stripeConfigured).toBe(true)
  expect(status.error ?? null).toBeNull()
  expect(typeof status.hasAccount).toBe('boolean')
  expect(typeof status.onboardingComplete).toBe('boolean')
})
