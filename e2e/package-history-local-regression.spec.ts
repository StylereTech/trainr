import { randomUUID } from 'node:crypto'
import { expect, test } from './fixtures/local-auth'

test.skip(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(process.env.BASE_URL || '') || !process.env.LOCAL_E2E_SECRET, 'Requires disposable loopback fixtures.')
test.use({ channel: process.env.LOCAL_E2E_CHANNEL || undefined })

for (const width of [1440, 390]) for (const role of ['PARENT', 'TRAINER'] as const) test.describe(`Package history ${role} ${width}px`, () => {
  test.use({ viewport: { width, height: 1000 } })
  for (const scenario of ['history', 'success', 'lost-response', 'malformed', 'provider-failure', 'read-failure'] as const) test(scenario, async ({ page, localAuth }, info) => {
    const db = localAuth.database, parent = await localAuth.create('PARENT'), trainer = await localAuth.create('TRAINER')
    const parentProfile = await db.parentProfile.findUniqueOrThrow({ where: { userId: parent.id } })
    const trainerProfile = await db.trainerProfile.findUniqueOrThrow({ where: { userId: trainer.id } })
    const key = randomUUID(), title = `Family training ${'long-package-title-'.repeat(6)}`
    const sport = await db.sport.create({ data: { name: `History ${key}`, slug: key } })
    let catalogId: string | undefined
    try {
      const service = await db.serviceOffering.create({ data: { trainerProfileId: trainerProfile.id, sportId: sport.id, title: 'Synthetic training', priceInCents: 3000 } })
      const catalog = await db.package.create({ data: { trainerProfileId: trainerProfile.id, title: 'Current catalog differs', totalSessions: 2, priceInCents: 9000,
        items: { create: { serviceOfferingId: service.id, sessionsCount: 2 } } } }); catalogId = catalog.id
      const purchase = await db.packagePurchase.create({ data: { parentProfileId: parentProfile.id, trainerProfileId: trainerProfile.id, packageId: catalog.id,
        requestId: key, payloadHash: 'a'.repeat(64), catalogRevision: catalog.updatedAt,
        terms: { version: 1, title, description: '', totalSessions: 2, validForDays: 90,
          items: [{ serviceOfferingId: service.id, title: 'Synthetic training', sportId: sport.id, durationMinutes: 60, type: 'INDIVIDUAL', sessionsCount: 2 }] },
        amountInCents: 6000, platformFeeInCents: 900, trainerPayoutInCents: 5100,
        ...(scenario === 'history' ? { status: 'PARTIALLY_REFUNDED', stripePaymentIntentId: `pi_synthetic_${key}`, stripeChargeId: `ch_synthetic_${key}`,
          stripeTransferId: `tr_synthetic_${key}`, settlementVerifiedAt: new Date(), refundsVerifiedAt: new Date(),
          refundAmountInCents: 2000, refundPendingAmountInCents: 1000, refundFailedCount: 1, financialReview: { synthetic: true } } : {}),
        checkoutAttempts: { create: { id: key, sequence: 1, stripeCheckoutSessionId: `cs_synthetic_${key}`, parameters: { synthetic: true } } },
      } })
      let calls = 0
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      // Browser response handling only; SQL integration tests verify provider receipts and ownership.
      await page.route('**/api/package-purchases/refresh', async route => {
        calls++; expect(route.request().postDataJSON()).toEqual({ purchaseId: purchase.id })
        if (scenario === 'success' || scenario === 'lost-response') await db.packagePurchase.update({ where: { id: purchase.id }, data: {
          status: 'SUCCEEDED', stripePaymentIntentId: `pi_synthetic_${key}`, stripeChargeId: `ch_synthetic_${key}`, stripeTransferId: `tr_synthetic_${key}`, settlementVerifiedAt: new Date() } })
        if (scenario === 'lost-response') return route.abort('failed')
        if (scenario === 'provider-failure') return route.fulfill({ status: 503, json: { error: 'Provider unavailable. Reload purchase history.' } })
        return route.fulfill({ json: scenario === 'malformed' ? { ok: true } : { refreshed: true, purchaseId: purchase.id } })
      })
      if (scenario === 'read-failure') await page.route('**/api/package-purchases?**', route => route.fulfill({ status: 503, json: { error: 'Synthetic outage' } }))
      await localAuth.signIn(role === 'PARENT' ? parent : trainer)
      const path = role === 'PARENT' ? '/parent/packages' : '/trainer/purchases'
      if (scenario === 'history') {
        await page.goto(role === 'PARENT' ? '/parent/dashboard' : '/trainer/packages')
        await page.getByRole('link', { name: role === 'PARENT' ? 'My packages' : 'Purchase history', exact: true }).click()
        await expect(page).toHaveURL(new RegExp(`${path}$`))
      } else await page.goto(path)
      if (scenario === 'read-failure') {
        await expect(page.getByRole('alert').filter({ hasText: 'Reload purchase state' })).toBeVisible()
        await expect(page.getByText('No package purchases in this view.', { exact: true })).toHaveCount(0)
        await page.unroute('**/api/package-purchases?**')
        await page.getByRole('button', { name: 'Reload purchase state', exact: true }).click()
      }
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
      await expect(page.getByText('Current catalog differs', { exact: true })).toHaveCount(0)
      await expect(page.getByText('$60.00', { exact: true })).toBeVisible()
      await expect(page.getByText('Session credits unavailable', { exact: true })).toBeVisible()
      const refresh = page.getByRole('button', { name: 'Refresh payment', exact: true })
      if (scenario === 'history') {
        await expect(page.getByText('Partially refunded', { exact: true })).toBeVisible()
        await expect(page.getByText('Successful refunds: $20.00', { exact: true })).toBeVisible()
        await expect(page.getByText('Pending refund: $10.00. Not yet completed.', { exact: true })).toBeVisible()
        await expect(page.getByText('Financial review required', { exact: true })).toBeVisible()
        await page.getByLabel('Payment status', { exact: true }).selectOption('paid')
        await expect(page.getByText('No package purchases in this view.', { exact: true })).toBeVisible()
        await page.getByLabel('Payment status', { exact: true }).selectOption('review')
        await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
      } else if (scenario !== 'read-failure') {
        await expect(page.getByText('Payment not recorded', { exact: true })).toBeVisible()
        await refresh.click()
        if (scenario === 'success') {
          await expect(page.getByText('Payment records refreshed', { exact: true })).toBeVisible()
          await expect(page.getByText('Payment verified', { exact: true })).toBeVisible()
        } else {
          await expect(page.getByRole('alert').filter({ hasText: 'Reload purchase state' })).toBeVisible(); await expect(refresh).toBeDisabled()
          await expect(page.getByText('Payment records refreshed', { exact: true })).toHaveCount(0)
          await page.getByRole('button', { name: 'Reload purchase state', exact: true }).click()
          await expect(refresh).toBeEnabled()
          await expect(page.getByText(scenario === 'lost-response' ? 'Payment verified' : 'Payment not recorded', { exact: true })).toBeVisible()
        }
        expect(calls).toBe(1)
      }
      if (role === 'TRAINER') await expect(page.getByText('Original trainer allocation: $51.00', { exact: true })).toBeVisible()
      else await expect(page.getByText('Original trainer allocation:', { exact: false })).toHaveCount(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: info.outputPath('package-history.png'), fullPage: true })
      await page.reload()
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
      expect(await db.booking.count()).toBe(0); expect(await db.walletEntry.count()).toBe(0)
      expect(errors).toEqual([])
    } finally {
      if (catalogId) await db.packagePurchase.deleteMany({ where: { packageId: catalogId } })
      await db.user.deleteMany({ where: { id: { in: [parent.id, trainer.id] } } })
      await db.sport.delete({ where: { id: sport.id } })
    }
  })
})
