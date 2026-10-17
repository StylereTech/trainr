import { expect, test } from '@playwright/test'

const previewUrl = 'https://trainr-git-codex-payment-readiness-20261006-styleres-projects.vercel.app'

test.use({ channel: process.env.LOCAL_E2E_CHANNEL || (process.platform === 'win32' ? 'chrome' : 'chromium') })
test.skip(process.env.TRAINR_PREVIEW_CONNECT_STATUS !== '1', 'Requires the approved isolated Preview trainer account')

test('trainer can read current Stripe Connect readiness without changing it', async ({ page }) => {
  expect(process.env.BASE_URL).toBe(previewUrl)
  const email = process.env.TRAINR_TEST_TRAINER_EMAIL
  const password = process.env.TRAINR_TEST_TRAINER_PASSWORD
  expect(email).toBeTruthy()
  expect(password).toBeTruthy()
  await page.goto('/auth/signin')
  await page.getByLabel('Email').fill(email!)
  await page.getByLabel('Password').fill(password!)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page).toHaveURL(/\/trainer\/dashboard$/)
  const response = await page.request.get('/api/trainer/stripe-connect')
  expect(response.status()).toBe(200)
  const status = await response.json()
  for (const key of ['connected', 'stripeConfigured', 'hasAccount', 'chargesEnabled', 'payoutsEnabled', 'transfersEnabled', 'detailsSubmitted', 'onboardingComplete']) {
    expect(typeof status[key], key).toBe('boolean')
  }
  console.log('Connect readiness:', JSON.stringify({ connected: status.connected, hasAccount: status.hasAccount,
    chargesEnabled: status.chargesEnabled, transfersEnabled: status.transfersEnabled,
    payoutsEnabled: status.payoutsEnabled, detailsSubmitted: status.detailsSubmitted,
    onboardingComplete: status.onboardingComplete, errorPresent: !!status.error }))
})
