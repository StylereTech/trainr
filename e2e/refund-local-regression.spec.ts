import { expect, test } from './fixtures/local-auth'
const local = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(process.env.BASE_URL || '')
test.skip(!local || !process.env.LOCAL_E2E_SECRET, 'Requires explicit disposable local authentication fixtures.')
test.use({ channel: process.env.LOCAL_E2E_CHANNEL || undefined })

for (const width of [1440, 390]) {
  test.describe(`refund UI ${width}px`, () => {
    test.use({ viewport: { width, height: 1000 }, timezoneId: 'UTC' })
    for (const role of ['PARENT', 'TRAINER', 'ADMIN'] as const) {
      test(`${role} separates successful, pending and failed refunds after reload`, async ({ page, localAuth }, testInfo) => {
        await localAuth.signIn(await localAuth.create(role))
        let verified = false, failRefresh = true, failList = false
        let refreshes = 0
        const booking = () => ({ id: 'booking', date: '2030-11-04', startTime: '09:00', endTime: '10:00', status: 'CANCELLED', createdAt: '2026-10-08T08:00:00Z',
          totalAmountInCents: 6000, platformFeeInCents: 900, trainerPayoutInCents: 5100, notes: null, review: null,
          trainerProfile: { firstName: 'Synthetic', lastName: 'Trainer', slug: 'fixture' }, parentProfile: { user: { email: 'parent@example.test' } },
          athleteProfile: { firstName: 'Synthetic', lastName: 'Athlete' }, serviceOffering: { title: 'Synthetic session', priceInCents: 6000 },
          payment: { status: 'PARTIALLY_REFUNDED', stripePaymentIntentId: 'pi_synthetic', refundAmountInCents: 2000, refundPendingAmountInCents: 1000, refundFailedCount: 1, refundsVerifiedAt: verified ? '2026-10-08T08:00:00Z' : null } })
        await page.route('**/api/**', async route => {
          const path = new URL(route.request().url()).pathname
          if (path === '/api/auth/session') return route.continue()
          if (path === '/api/bookings' || path === '/api/admin/bookings') return route.fulfill(failList ? { status: 503, json: { error: 'Synthetic list unavailable' } } : { json: { bookings: [booking()], pagination: { total: 1, page: 1, totalPages: 1 } } })
          if (path === '/api/admin/refunds') {
            refreshes++
            expect(route.request().postDataJSON()).toEqual({ bookingId: 'booking', action: 'reconcile' })
            if (failRefresh) return route.fulfill({ status: 503, json: { error: 'Synthetic Stripe read unavailable. Retry reconciliation.' } })
            verified = true
            return route.fulfill({ json: { status: 'PARTIALLY_REFUNDED', refundedAmountInCents: 2000, pendingAmountInCents: 1000, failedCount: 1 } })
          }
          if (path === '/api/athletes') return route.fulfill({ json: { athletes: [] } })
          if (path === '/api/payments/connect') return route.fulfill({ json: { connected: false, chargesEnabled: false, payoutsEnabled: false } })
          return route.fulfill({ json: {} })
        })
        const path = role === 'ADMIN' ? '/admin/bookings' : `/${role.toLowerCase()}/dashboard`
        const chooseHistory = async () => {
          if (role === 'PARENT') await page.getByRole('tab', { name: /^Past/ }).click()
          if (role === 'TRAINER') await page.getByRole('tab', { name: /^All / }).click()
        }
        await page.goto(path)
        await chooseHistory()
        await expect(page.getByTestId('refund-summary')).toHaveText('Recorded refund needs Stripe verification.')
        if (role === 'ADMIN') {
          await page.getByRole('button', { name: 'Refresh refunds' }).click()
          await expect(page.getByRole('alert').filter({ hasText: 'Synthetic Stripe read unavailable' })).toBeVisible()
          await expect(page.getByTestId('refund-summary')).toHaveText('Recorded refund needs Stripe verification.')
          failRefresh = false
          failList = true
          await page.getByRole('button', { name: 'Refresh refunds' }).click()
          await expect(page.getByText('Unable to load current bookings. Retry before relying on displayed payment state.')).toBeVisible()
          await expect(page.getByText('No bookings found')).toHaveCount(0)
          await expect(page.getByText('Refund status verified', { exact: true })).toHaveCount(0)
          failList = false
          await page.getByRole('button', { name: 'Retry', exact: true }).click()
          await page.getByRole('button', { name: 'Refresh refunds' }).click()
          await expect(page.getByText('No refund or transfer was issued by this refresh.', { exact: true })).toBeVisible()
          expect(refreshes).toBe(3)
        } else { verified = true; await page.reload(); await chooseHistory() }
        const summary = page.getByTestId('refund-summary')
        await expect(summary).toContainText('Successful refunds: $20.00')
        await expect(summary).toContainText('Pending refund: $10.00. Not yet completed.')
        await expect(summary).toContainText('1 refund(s) failed or cancelled.')
        if (role !== 'PARENT') await expect(page.getByText('Net payout needs reconciliation', { exact: true })).toBeVisible()
        await summary.scrollIntoViewIfNeeded()
        if (role !== 'ADMIN') {
          const list = await page.getByRole('tablist').boundingBox()
          const panel = await page.getByRole('tabpanel').boundingBox()
          expect(panel!.y).toBeGreaterThanOrEqual(list!.y + list!.height)
          for (const tab of await page.getByRole('tab').all()) {
            const box = await tab.boundingBox()
            expect(box!.y + box!.height).toBeLessThanOrEqual(list!.y + list!.height)
          }
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        const bounds = await summary.boundingBox()
        expect(bounds!.x).toBeGreaterThanOrEqual(0)
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
        await page.screenshot({ path: testInfo.outputPath('refund-summary.png') })
        await page.reload()
        await chooseHistory()
        await expect(page.getByTestId('refund-summary')).toContainText('Successful refunds: $20.00')
        await expect(page.getByTestId('refund-summary')).toContainText('Not yet completed.')
      })
    }
  })
}
