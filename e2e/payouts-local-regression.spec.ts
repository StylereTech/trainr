import { test, expect } from './fixtures/local-auth'

test.use({ channel: process.env.LOCAL_E2E_CHANNEL || 'msedge' })
const ready = { providerConfigured: true, publishableKeyConfigured: true, stripeAccountId: 'acct_synthetic', stripeOnboardingComplete: true,
  chargesEnabled: true, payoutsEnabled: true, transfersEnabled: true, providerError: '', dashboardSupported: true, onboardingSupported: false }
const wallet = { source: 'stripe', connected: true, currency: 'usd', wallet: { availableBalance: 12345, pendingBalance: 6789 }, hasMore: false, nextCursor: null,
  schedule: { interval: 'daily' }, payouts: [{ id: 'po_synthetic', amountInCents: 4500, currency: 'usd', status: 'paid', arrivalDate: 1791590400, createdAt: 1791504000 }] }

for (const width of [1440, 390]) for (const scenario of ['history', 'provider-failure', 'malformed'] as const) {
  test(`payout pages ${scenario} ${width}px`, async ({ page, localAuth }, info) => {
    await page.setViewportSize({ width, height: 1000 })
    await localAuth.signIn(await localAuth.create('PARENT'))
    expect((await page.request.get('/api/trainer/wallet?startingAfter=po_other')).status()).toBe(403)
    await localAuth.signIn(await localAuth.create('TRAINER'))
    await page.route('**/api/payments/connect', route => route.fulfill({ json: ready }))
    let failed = false
    const cursors: Array<string | null> = []
    await page.route('**/api/trainer/wallet*', route => {
      const cursor = new URL(route.request().url()).searchParams.get('startingAfter')
      cursors.push(cursor)
      expect([null, 'po_page20', 'po_page21']).toContain(cursor)
      if (cursor === 'po_page20' && !failed && scenario !== 'history') {
        failed = true
        return route.fulfill(scenario === 'provider-failure' ? { status: 503, json: { error: 'synthetic' } } : { json: { ...wallet, hasMore: true, nextCursor: 'po_wrong' } })
      }
      const payouts = !cursor ? Array.from({ length: 20 }, (_, i) => ({ ...wallet.payouts[0], id: `po_page${i + 1}`, amountInCents: 1000 + i }))
        : cursor === 'po_page20' ? [{ ...wallet.payouts[0], id: 'po_page21', amountInCents: 2121 }] : []
      return route.fulfill({ json: { ...wallet, payouts, hasMore: cursor !== 'po_page21', nextCursor: cursor === 'po_page21' ? null : payouts.at(-1)!.id } })
    })
    await page.goto('/trainer/profile?tab=payouts')
    const panel = page.getByRole('region', { name: 'Stripe earnings and payouts' })
    await expect(panel.getByText('Page 1', { exact: true })).toBeVisible()
    await expect(panel.getByRole('listitem')).toHaveCount(20)
    await expect(panel.getByRole('button', { name: 'Newer payouts' })).toBeDisabled()
    await panel.getByRole('button', { name: 'Older payouts' }).click()
    if (scenario !== 'history') {
      await expect(panel.getByText('Unable to load current Stripe balances and payouts.')).toBeVisible()
      await expect(panel.getByRole('button', { name: 'Older payouts' })).toBeDisabled()
      await expect(panel.getByRole('button', { name: 'Newer payouts' })).toBeEnabled()
      await expect(panel.getByText('No bank payouts reported by Stripe yet.')).toHaveCount(0)
      await panel.getByRole('button', { name: 'Retry', exact: true }).click()
    }
    await expect(panel.getByText('Page 2', { exact: true })).toBeVisible()
    await expect(panel.getByText('$21.21', { exact: true })).toBeVisible()
    await expect(panel.getByRole('listitem')).toHaveCount(1)
    await panel.screenshot({ path: info.outputPath('payout-page-two.png') })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await panel.getByRole('button', { name: 'Older payouts' }).click()
    await expect(panel.getByText('No older bank payouts reported by Stripe.')).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Older payouts' })).toBeDisabled()
    await panel.getByRole('button', { name: 'Newer payouts' }).click()
    await expect(panel.getByText('$21.21', { exact: true })).toBeVisible()
    await panel.getByRole('button', { name: 'Refresh Stripe balances' }).click()
    await expect(panel.getByText('Page 1', { exact: true })).toBeVisible()
    await expect(panel.getByRole('listitem')).toHaveCount(20)
    expect(cursors.filter(cursor => cursor === 'po_page20').length).toBe(scenario === 'history' ? 2 : 3)
    await page.reload()
    await expect(panel.getByText('Page 1', { exact: true })).toBeVisible()
  })
}

for (const width of [1440, 390]) {
  test(`payout data failures clear balances and schedule and recover ${width}px`, async ({ page, localAuth }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    await localAuth.signIn(await localAuth.create('TRAINER'))
    let phase = 'ready'
    await page.route('**/api/payments/connect', route => route.fulfill({ json: ready }))
    await page.route('**/api/trainer/wallet', route => {
      if (phase === 'outage') return route.fulfill({ status: 503, json: { error: 'synthetic outage' } })
      if (phase === 'malformed') return route.fulfill({ json: { ...wallet, payouts: {} } })
      if (phase === 'currency') return route.fulfill({ json: { ...wallet, payouts: [{ ...wallet.payouts[0], currency: 'invalid' }] } })
      if (phase === 'empty') return route.fulfill({ json: { ...wallet, payouts: [] } })
      return route.fulfill({ json: wallet })
    })
    await page.goto('/trainer/profile?tab=payouts')
    const panel = page.getByRole('region', { name: 'Stripe earnings and payouts' })
    await expect(panel.getByText('$123.45', { exact: true })).toBeVisible()
    await expect(panel.getByText('$45.00', { exact: true })).toBeVisible()
    await expect(panel.getByText('Bank payout schedule: daily.')).toBeVisible()
    for (const failure of ['outage', 'malformed', 'currency']) {
      phase = failure
      await panel.getByRole('button', { name: 'Refresh Stripe balances', exact: true }).click()
      await expect(panel.getByText('Unable to load current Stripe balances and payouts.')).toBeVisible()
      await expect(panel.getByText('$123.45', { exact: true })).toHaveCount(0)
      await expect(panel.getByText('Bank payout schedule: daily.')).toHaveCount(0)
      await expect(panel.getByText('Bank payout schedule not yet verified.')).toBeVisible()
      phase = 'ready'
      await panel.getByRole('button', { name: 'Retry', exact: true }).click()
      await expect(panel.getByText('$123.45', { exact: true })).toBeVisible()
    }
    await panel.screenshot({ path: testInfo.outputPath('payouts-verified.png') })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    phase = 'empty'
    await panel.getByRole('button', { name: 'Refresh Stripe balances', exact: true }).click()
    await expect(panel.getByText('No bank payouts reported by Stripe yet.')).toBeVisible()
  })

  test(`payout setup rejects stale readiness and unsafe redirect ${width}px`, async ({ page, localAuth }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    await localAuth.signIn(await localAuth.create('TRAINER'))
    let phase = 'ready'
    await page.route('**/api/payments/connect', route => {
      if (route.request().method() === 'POST') return route.fulfill({ json: { dashboardUrl: 'https://attacker.example.test/' } })
      if (phase === 'error') return route.fulfill({ status: 503, json: {} })
      if (phase === 'malformed') return route.fulfill({ json: { stripeOnboardingComplete: true } })
      if (phase === 'stale') return route.fulfill({ json: { ...ready, providerError: 'Synthetic provider failure' } })
      return route.fulfill({ json: ready })
    })
    await page.route('**/api/trainer/wallet', route => route.fulfill({ json: wallet }))
    await page.goto('/trainer/profile?tab=payouts')
    const panel = page.getByRole('region', { name: 'Stripe earnings and payouts' })
    await expect(panel.getByText('Payments ready', { exact: true })).toBeVisible()
    for (const failure of ['error', 'malformed', 'stale']) {
      phase = failure
      await panel.getByRole('button', { name: 'Refresh Stripe status' }).click()
      await expect(panel.getByText('Stripe status unverified', { exact: true })).toBeVisible()
      await expect(panel.getByText('Payments ready', { exact: true })).toHaveCount(0)
      await expect(panel.getByRole('button', { name: /Start Stripe setup|Resume Stripe setup|Open Stripe dashboard/ })).toBeDisabled()
    }
    await panel.screenshot({ path: testInfo.outputPath('payouts-unverified.png') })
    phase = 'ready'
    await panel.getByRole('button', { name: 'Refresh Stripe status' }).click()
    await panel.getByRole('button', { name: 'Open Stripe dashboard' }).click()
    await expect(page.getByText('Stripe setup unavailable', { exact: true })).toBeVisible()
    await expect(page).toHaveURL(/\/trainer\/profile\?tab=payouts$/)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test(`unlinked payout screen uses real authenticated endpoints ${width}px`, async ({ page, localAuth }) => {
    await page.setViewportSize({ width, height: 1000 })
    await localAuth.signIn(await localAuth.create('TRAINER'))
    await page.goto('/trainer/profile?tab=payouts')
    await expect(page.getByText('Stripe not started', { exact: true })).toBeVisible()
    await expect(page.getByText('No connected Stripe balance is available yet.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Start Stripe setup' })).toBeEnabled()
  })

  test(`hung payout requests time out and can be retried ${width}px`, async ({ page, localAuth }) => {
    test.setTimeout(60000)
    await page.setViewportSize({ width, height: 1000 })
    await localAuth.signIn(await localAuth.create('TRAINER'))
    let recover = false
    await page.route('**/api/payments/connect', route => { if (recover) return route.fulfill({ json: ready }) })
    await page.route('**/api/trainer/wallet', route => { if (recover) return route.fulfill({ json: wallet }) })
    await page.goto('/trainer/profile?tab=payouts')
    const panel = page.getByRole('region', { name: 'Stripe earnings and payouts' })
    await expect(panel.getByText('Unable to load current Stripe balances and payouts.')).toBeVisible({ timeout: 25000 })
    await expect(panel.getByText('Stripe status unverified', { exact: true })).toBeVisible()
    recover = true
    await panel.getByRole('button', { name: 'Retry', exact: true }).click()
    await panel.getByRole('button', { name: 'Refresh Stripe status' }).click()
    await expect(panel.getByText('$123.45', { exact: true })).toBeVisible()
    await expect(panel.getByText('Payments ready', { exact: true })).toBeVisible()
  })
}
