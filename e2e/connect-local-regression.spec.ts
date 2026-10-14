import { test, expect } from './fixtures/local-auth'
test.use({ channel: process.env.LOCAL_E2E_CHANNEL || 'msedge' })

for (const width of [1440, 390]) {
  test(`Connect status never promotes malformed or stale readiness ${width}px`, async ({ page, localAuth }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    await localAuth.signIn(await localAuth.create('TRAINER'))
    let phase = 'error'
    const ready = { providerConfigured: true, publishableKeyConfigured: true, stripeAccountId: 'acct_synthetic', stripeOnboardingComplete: true,
      chargesEnabled: true, payoutsEnabled: true, transfersEnabled: true, providerError: '', dashboardSupported: true, onboardingSupported: false }
    await page.route('**/api/payments/connect', async route => {
      if (phase === 'error') return route.fulfill({ status: 503, json: { error: 'synthetic outage' } })
      if (phase === 'malformed') return route.fulfill({ json: { stripeOnboardingComplete: true } })
      if (phase === 'stale') return route.fulfill({ json: { ...ready, providerError: 'Current Stripe status could not be verified.', chargesEnabled: null, payoutsEnabled: null, transfersEnabled: null } })
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
    expect(await status.json()).toMatchObject({ stripeAccountId: null, stripeOnboardingComplete: false, transfersEnabled: null, dashboardSupported: false, onboardingSupported: true })
    expect(await (await page.request.get('/api/trainer/stripe-connect')).json()).toMatchObject({ hasAccount: false, connected: false, onboardingComplete: false, transfersEnabled: null })
    await page.goto('/trainer/dashboard')
    await expect(page.getByText('Stripe not started', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Start Stripe setup' })).toBeEnabled()
  })
  test(`payout profile uses a safe fallback for malformed setup errors ${width}px`, async ({ page, localAuth }) => {
    await page.setViewportSize({ width, height: 1000 })
    await localAuth.signIn(await localAuth.create('TRAINER'))
    let failure = 'html'
    await page.route('**/api/payments/connect', route => {
      if (route.request().method() === 'POST') return failure === 'html'
        ? route.fulfill({ status: 503, contentType: 'text/html', body: '<html>Temporarily unavailable</html>' })
        : route.fulfill({ status: 409, json: { error: { internal: 'not-displayable' } } })
      return route.fulfill({ json: { providerConfigured: true, publishableKeyConfigured: true, stripeAccountId: null,
        stripeOnboardingComplete: false, chargesEnabled: null, payoutsEnabled: null, transfersEnabled: null,
        providerError: '', dashboardSupported: false, onboardingSupported: true } })
    })
    for (const kind of ['html', 'object']) {
      failure = kind
      await page.goto('/trainer/profile?tab=payouts')
      await page.getByRole('button', { name: 'Start Stripe setup', exact: true }).click()
      await expect(page.getByText('Unable to open Stripe. Refresh your account status and try again.', { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Start Stripe setup', exact: true })).toBeEnabled()
      await expect(page.getByText('Payments ready', { exact: true })).toHaveCount(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
  })
  for (const path of ['/trainer/dashboard', '/trainer/profile?tab=payouts']) {
    test(`package history requires reconciliation before new Stripe setup on ${path} ${width}px`, async ({ page, localAuth }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 })
      const trainer = await localAuth.create('TRAINER'), parent = await localAuth.create('PARENT')
      const db = localAuth.database
      const trainerProfile = await db.trainerProfile.findUniqueOrThrow({ where: { userId: trainer.id } })
      const parentProfile = await db.parentProfile.findUniqueOrThrow({ where: { userId: parent.id } })
      const catalog = await db.package.create({ data: { trainerProfileId: trainerProfile.id, title: 'Historical package', totalSessions: 1, priceInCents: 3000 } })
      const purchase = await db.packagePurchase.create({ data: { parentProfileId: parentProfile.id, trainerProfileId: trainerProfile.id,
        packageId: catalog.id, requestId: catalog.id, payloadHash: 'a'.repeat(64), catalogRevision: catalog.updatedAt,
        amountInCents: 3000, platformFeeInCents: 450, trainerPayoutInCents: 2550, stripePaymentIntentId: `pi_${catalog.id}`,
        terms: { version: 1, title: 'Historical package', description: '', validForDays: 90, totalSessions: 1,
          items: [{ serviceOfferingId: 'historical-service', title: 'Training', sportId: 'historical-sport', durationMinutes: 60, type: 'INDIVIDUAL', sessionsCount: 1 }] },
      } })
      try {
        await localAuth.signIn(trainer)
        await page.goto(path)
        for (let attempt = 0; attempt < 2; attempt++) {
          const response = page.waitForResponse(result => result.url().endsWith('/api/payments/connect') && result.request().method() === 'POST')
          await page.getByRole('button', { name: 'Start Stripe setup', exact: true }).click()
          expect((await response).status()).toBe(409)
          await expect(page.getByText('Stripe setup unavailable', { exact: true })).toBeVisible()
          await expect(page.getByText('Existing package payment history has no connected account. Contact support for reconciliation before setup.', { exact: true })).toBeVisible()
          expect((await db.trainerProfile.findUniqueOrThrow({ where: { id: trainerProfile.id } })).stripeAccountId).toBeNull()
          expect(await db.connectAccountAttempt.count({ where: { trainerProfileId: trainerProfile.id } })).toBe(0)
          expect(await db.packagePurchase.findUniqueOrThrow({ where: { id: purchase.id } })).toEqual(purchase)
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
          if (attempt === 0) await page.reload()
        }
        await page.screenshot({ path: testInfo.outputPath('package-history-reconciliation.png') })
      } finally { await db.packagePurchase.delete({ where: { id: purchase.id } }) }
    })
    test(`transfer capability gates ready status on ${path} ${width}px`, async ({ page, localAuth }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 })
      await localAuth.signIn(await localAuth.create('TRAINER'))
      let phase = 'inactive'
      await page.route('**/api/payments/connect', route => route.fulfill({ json: {
        providerConfigured: true, publishableKeyConfigured: true, stripeAccountId: 'acct_synthetic', stripeOnboardingComplete: true,
        chargesEnabled: true, payoutsEnabled: true, providerError: '', dashboardSupported: phase === 'active', onboardingSupported: phase !== 'active',
        ...(phase === 'missing' ? {} : { transfersEnabled: phase === 'active' }),
      } }))
      await page.goto(path)
      await expect(page.getByText('Transfers not enabled', { exact: true })).toBeVisible()
      await expect(page.getByText('Setup in progress', { exact: true })).toBeVisible()
      await expect(page.getByText('Payments ready', { exact: true })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Resume Stripe setup', exact: true })).toBeEnabled()
      await page.getByText('Transfers not enabled', { exact: true }).scrollIntoViewIfNeeded()
      await page.screenshot({ path: testInfo.outputPath('transfers-unavailable.png'), fullPage: true })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      phase = 'active'
      await page.getByRole('button', { name: 'Refresh Stripe status', exact: true }).click()
      await expect(page.getByText('Transfers enabled', { exact: true })).toBeVisible()
      await expect(page.getByText('Payments ready', { exact: true })).toBeVisible()
      phase = 'missing'
      await page.getByRole('button', { name: 'Refresh Stripe status', exact: true }).click()
      await expect(page.getByText('Stripe status unverified', { exact: true })).toBeVisible()
      await expect(page.getByText('Payments ready', { exact: true })).toHaveCount(0)
      await expect(page.getByRole('button', { name: /Start Stripe setup|Resume Stripe setup|Open Stripe dashboard/ })).toBeDisabled()
    })
  }
}
