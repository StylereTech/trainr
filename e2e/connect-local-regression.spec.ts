import { test, expect } from './fixtures/local-auth'
test.use({ channel: process.env.LOCAL_E2E_CHANNEL || 'msedge' })

for (const width of [1440, 390]) {
  test(`Connect status never promotes malformed or stale readiness ${width}px`, async ({ page, localAuth }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    await localAuth.signIn(await localAuth.create('TRAINER'))
    let phase = 'error'
    const ready = { providerConfigured: true, publishableKeyConfigured: true, stripeAccountId: 'acct_synthetic', stripeOnboardingComplete: true,
      chargesEnabled: true, payoutsEnabled: true, providerError: '', dashboardSupported: true, onboardingSupported: false }
    await page.route('**/api/payments/connect', async route => {
      if (phase === 'error') return route.fulfill({ status: 503, json: { error: 'synthetic outage' } })
      if (phase === 'malformed') return route.fulfill({ json: { stripeOnboardingComplete: true } })
      if (phase === 'stale') return route.fulfill({ json: { ...ready, providerError: 'Current Stripe status could not be verified.', chargesEnabled: null, payoutsEnabled: null } })
      if (route.request().method() === 'POST') return route.fulfill({ json: { dashboardUrl: 'https://attacker.example.test/private' } })
      return route.fulfill({ json: ready })
    })
    await page.goto('/trainer/dashboard')
    for (const next of ['malformed', 'stale', 'ready']) {
      await expect(page.getByText('Stripe status unverified', { exact: true })).toBeVisible()
      await expect(page.getByText('Payments ready', { exact: true })).toHaveCount(0)
      await expect(page.getByText('Start or resume Stripe onboarding here', { exact: false })).toHaveCount(0)
      await expect(page.getByRole('button', { name: /Start Stripe setup|Resume Stripe setup|Open Stripe dashboard/ })).toBeDisabled()
      if (next === 'ready') {
        await page.getByText('Stripe payout setup', { exact: true }).scrollIntoViewIfNeeded()
        await page.screenshot({ path: testInfo.outputPath('connect-unverified.png') })
      }
      phase = next
      await page.getByRole('button', { name: 'Refresh Stripe status' }).click()
      await expect(page.getByText('Checking Stripe', { exact: true })).toHaveCount(0)
    }
    await expect(page.getByText('Payments ready', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Open Stripe dashboard' }).click()
    await expect(page.getByText('Stripe setup unavailable', { exact: true })).toBeVisible()
    await expect(page).toHaveURL(/\/trainer\/dashboard$/)
    await page.getByText('Stripe payout setup', { exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath('connect-status.png') })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
  test(`real unlinked status and legacy adapter agree ${width}px`, async ({ page, localAuth }) => {
    await page.setViewportSize({ width, height: 1000 })
    await localAuth.signIn(await localAuth.create('TRAINER'))
    const status = await page.request.get('/api/payments/connect')
    expect(status.status()).toBe(200)
    expect(status.headers()['cache-control']).toBe('private, no-store')
    expect(await status.json()).toMatchObject({ stripeAccountId: null, stripeOnboardingComplete: false, dashboardSupported: false, onboardingSupported: true })
    expect(await (await page.request.get('/api/trainer/stripe-connect')).json()).toMatchObject({ hasAccount: false, connected: false, onboardingComplete: false })
    await page.goto('/trainer/dashboard')
    await expect(page.getByText('Stripe not started', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Start Stripe setup' })).toBeEnabled()
  })
}
