import { test, expect } from './fixtures/local-auth'
import { createLocalCreditBooking } from './fixtures/package-credit'
import { Prisma } from '@prisma/client'

test.skip(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(process.env.BASE_URL || '') || !process.env.LOCAL_E2E_SECRET, 'Requires disposable loopback fixtures.')
test.use({ channel: process.env.LOCAL_E2E_CHANNEL || undefined })

for (const width of [1440, 390]) test.describe(`credit dashboard ${width}px`, () => {
  test.use({ viewport: { width, height: 1000 } })
  for (const role of ['PARENT', 'TRAINER', 'ADMIN'] as const) for (const state of ['clean', 'held', 'json-null-held', 'restored'] as const) {
    test(`${role} ${state}`, async ({ page, localAuth }, testInfo) => {
      const fixture = await createLocalCreditBooking(localAuth, { title: 'P'.repeat(150) })
      const { booking, purchase, parent, trainer } = fixture
      const db = localAuth.database
      try {
        if (state === 'held') await db.packagePurchase.update({ where: { id: purchase.id }, data: { financialReview: { detail: 'private-provider-review' } } })
        if (state === 'json-null-held') await db.packagePurchase.update({ where: { id: purchase.id }, data: { financialReview: Prisma.JsonNull } })
        if (state === 'restored') {
          await localAuth.signIn(parent)
          expect((await page.request.patch(`/api/bookings/${booking.id}`, { data: { action: 'cancel' } })).status()).toBe(200)
        }
        const actor = role === 'PARENT' ? parent : role === 'TRAINER' ? trainer : await localAuth.create('ADMIN')
        await localAuth.signIn(actor)
        await page.route('**/api/payments/connect', route => route.fulfill({ json: { providerConfigured: true, publishableKeyConfigured: true,
          stripeAccountId: null, stripeOnboardingComplete: false, chargesEnabled: null, payoutsEnabled: null, transfersEnabled: null, providerError: '', dashboardSupported: false, onboardingSupported: true } }))
        await page.route('**/api/trainer/wallet', route => route.fulfill({ json: { source: 'stripe', connected: false, wallet: null } }))
        await page.goto(role === 'PARENT' ? '/parent/dashboard' : role === 'TRAINER' ? '/trainer/dashboard' : '/admin/bookings')
        if (role === 'PARENT' && state === 'restored') await page.getByRole('tab', { name: 'Past (1)', exact: true }).click()
        if (role === 'TRAINER') await page.getByRole('tab', { name: state === 'restored' ? 'All (1)' : 'Confirmed (1)', exact: true }).click()
        await expect(page.getByText('Package credit', { exact: true })).toBeVisible()
        await expect(page.getByText('1 session credit', { exact: true })).toBeVisible()
        await expect(page.getByText('Payment not recorded', { exact: true })).toHaveCount(0)
        await expect(page.getByRole('button', { name: 'Pay now', exact: true })).toHaveCount(0)
        const response = await page.request.get(role === 'ADMIN' ? '/api/admin/bookings' : `/api/dashboard/bookings?view=${role === 'PARENT' ? state === 'restored' ? 'past' : 'upcoming' : 'all'}`)
        expect(response.status()).toBe(200)
        expect(response.headers()['cache-control']).toBe('private, no-store')
        const result = await response.json(), serialized = JSON.stringify(result)
        expect(serialized).not.toContain(purchase.stripePaymentIntentId!)
        expect(serialized).not.toContain('private-provider-review')
        expect(result.bookings[0]).not.toHaveProperty('creditRedemption')
        expect(result.bookings[0].creditFunding.purchaseId).toBe(purchase.id)
        const general = await (await page.request.get('/api/bookings')).json()
        expect(general.bookings[0]).not.toHaveProperty('creditRedemption')
        expect(JSON.stringify(general)).not.toContain(purchase.stripeChargeId!)
        expect(general.bookings[0].creditFunding.hold).toBe(result.bookings[0].creditFunding.hold)
        if (state === 'restored') {
          await expect(page.getByText('Session credit returned', { exact: true })).toBeVisible()
          await expect(page.getByRole('button', { name: 'Reconcile checkout', exact: true })).toHaveCount(0)
        } else {
          if (state === 'held' || state === 'json-null-held') await expect(page.getByText('Package payment needs reconciliation before recording this session outcome.', { exact: true })).toBeVisible()
          else await expect(page.getByText('1 session credit used', { exact: true })).toBeVisible()
          if (role !== 'PARENT') {
            // The UI clock must not override either the payment hold or server time.
            await page.clock.setFixedTime(new Date(booking.endsAt!.getTime() + 1))
            const complete = page.getByRole('button', { name: 'Complete', exact: true })
            if (state === 'held' || state === 'json-null-held') await expect(complete).toBeDisabled()
            else await expect(complete).toBeEnabled()
          }
          if (role === 'ADMIN') await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        if (role === 'PARENT') {
          const tile = await page.getByRole('link', { name: 'Synthetic Child', exact: true }).locator('..').locator('..').locator('..').boundingBox()
          const panel = await page.getByRole('heading', { name: 'My Athletes', exact: true }).locator('..').locator('..').locator('..').boundingBox()
          expect(tile).not.toBeNull(); expect(panel).not.toBeNull()
          expect(tile!.x).toBeGreaterThanOrEqual(panel!.x)
          expect(tile!.x + tile!.width).toBeLessThanOrEqual(panel!.x + panel!.width)
        }
        const packageTitle = page.getByText(`Package: ${'P'.repeat(150)}`, { exact: true })
        await expect(packageTitle).toBeVisible()
        expect(await packageTitle.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
        await page.getByText('1 session credit', { exact: true }).scrollIntoViewIfNeeded()
        await page.screenshot({ path: testInfo.outputPath('credit-funding.png'), fullPage: true })
        if (state !== 'restored' && role !== 'ADMIN') {
          page.once('dialog', async dialog => { expect(dialog.message()).toContain('No cash refund'); await dialog.accept() })
          await page.getByRole('button', { name: 'Cancel session', exact: true }).click()
          await expect.poll(async () => (await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('CANCELLED')
          await page.getByRole('tab', { name: role === 'PARENT' ? 'Past (1)' : 'All (1)', exact: true }).click()
          await expect(page.getByText('Session credit returned', { exact: true })).toBeVisible()
          await page.reload()
          if (role === 'PARENT') await page.getByRole('tab', { name: 'Past (1)', exact: true }).click()
          else await page.getByRole('tab', { name: 'All (1)', exact: true }).click()
          await expect(page.getByText('Session credit returned', { exact: true })).toBeVisible()
          expect(await db.notification.count({ where: { userId: { in: [parent.id, trainer.id] } } })).toBe(2)
          expect((await db.packagePurchase.findUniqueOrThrow({ where: { id: purchase.id } })).financialReview).toEqual(state === 'held' ? { detail: 'private-provider-review' } : null)
          if (state === 'json-null-held') expect(await db.packagePurchase.count({ where: { id: purchase.id, financialReview: { equals: Prisma.JsonNull } } })).toBe(1)
        }
        expect(await db.payment.count({ where: { bookingId: booking.id } })).toBe(0)
        expect(await db.walletEntry.count({ where: { bookingId: booking.id } })).toBe(0)
      } finally { await fixture.cleanup() }
    })
  }

  for (const recovery of ['normal', 'lost-response', 'invalid-json'] as const) test(`late parent cancellation ${recovery}`, async ({ page, localAuth }) => {
    const fixture = await createLocalCreditBooking(localAuth, { startsInMs: 3600000 })
    try {
      await localAuth.signIn(fixture.parent)
      await page.goto('/parent/dashboard')
      await expect(page.getByRole('button', { name: 'Cancel session', exact: true })).toBeVisible()
      let intercepted = false
      let interceptedStatus: number | null = null
      if (recovery !== 'normal') await page.route(`**/api/bookings/${fixture.booking.id}`, async route => {
        if (intercepted || route.request().method() !== 'PATCH') return route.continue()
        intercepted = true
        const response = await route.fetch()
        interceptedStatus = response.status()
        if (interceptedStatus !== 200) return route.fulfill({ response })
        if (recovery === 'lost-response') await route.abort('failed')
        else await route.fulfill({ status: 200, contentType: 'text/html', body: '<html>private-gateway-diagnostic</html>' })
      })
      page.once('dialog', async dialog => { expect(dialog.message()).toContain('Later cancellations use the credit'); await dialog.accept() })
      await page.getByRole('button', { name: 'Cancel session', exact: true }).click()
      if (recovery !== 'normal') {
        await expect.poll(() => interceptedStatus).toBe(200)
        const warning = page.getByRole('alert').filter({ has: page.getByRole('button', { name: 'Refresh booking state', exact: true }) })
        await expect(warning).toBeVisible()
        if (recovery === 'invalid-json') await expect(warning).toContainText('Cancellation could not be verified. Refresh before another action.')
        expect(await page.locator('body').innerText()).not.toContain('private-gateway-diagnostic')
        await expect(page.getByRole('button', { name: 'Cancel session', exact: true })).toBeDisabled()
        await page.getByRole('button', { name: 'Refresh booking state', exact: true }).click()
        expect(intercepted).toBe(true)
      }
      await page.getByRole('tab', { name: 'Past (1)', exact: true }).click()
      await expect(page.getByText('1 session credit used', { exact: true })).toBeVisible()
      await expect(page.getByText('Session credit returned', { exact: true })).toHaveCount(0)
      const ledger = await localAuth.database.packageCreditRedemption.findUniqueOrThrow({ where: { bookingId: fixture.booking.id } })
      expect(ledger.restoredAt).toBeNull()
      expect(await localAuth.database.notification.count({ where: { userId: fixture.parent.id } })).toBe(1)
    } finally { await fixture.cleanup() }
  })

  test('server rejects a financial hold added after the trainer page loaded', async ({ page, localAuth }) => {
    const fixture = await createLocalCreditBooking(localAuth)
    try {
      await localAuth.signIn(fixture.trainer)
      await page.route('**/api/payments/connect', route => route.fulfill({ json: { providerConfigured: true, publishableKeyConfigured: true,
        stripeAccountId: null, stripeOnboardingComplete: false, chargesEnabled: null, payoutsEnabled: null, transfersEnabled: null, providerError: '', dashboardSupported: false, onboardingSupported: true } }))
      await page.route('**/api/trainer/wallet', route => route.fulfill({ json: { source: 'stripe', connected: false, wallet: null } }))
      await page.goto('/trainer/dashboard')
      await page.getByRole('tab', { name: 'Confirmed (1)', exact: true }).click()
      await page.clock.setFixedTime(new Date(fixture.booking.endsAt!.getTime() + 1))
      const complete = page.getByRole('button', { name: 'Complete', exact: true })
      await expect(complete).toBeEnabled()
      await localAuth.database.packagePurchase.update({ where: { id: fixture.purchase.id }, data: { financialReview: { detail: 'private-provider-review' } } })
      await complete.click()
      await expect(page.getByRole('alert').filter({ hasText: 'Package payment needs reconciliation' })).toBeVisible()
      await expect(complete).toBeDisabled()
      expect((await localAuth.database.booking.findUniqueOrThrow({ where: { id: fixture.booking.id } })).status).toBe('CONFIRMED')
      expect(await localAuth.database.notification.count({ where: { userId: fixture.parent.id } })).toBe(0)
      expect(await page.locator('body').innerText()).not.toContain('private-provider-review')
    } finally { await fixture.cleanup() }
  })
})
