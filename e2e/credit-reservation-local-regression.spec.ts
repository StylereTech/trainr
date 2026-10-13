import { test, expect } from './fixtures/local-auth'
import { createLocalCreditBooking } from './fixtures/package-credit'

test.skip(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(process.env.BASE_URL || '') || !process.env.LOCAL_E2E_SECRET, 'Requires disposable loopback fixtures.')
test.use({ channel: process.env.LOCAL_E2E_CHANNEL || undefined })

for (const width of [1440, 390]) test.describe(`credit reservation ${width}px`, () => {
  test.use({ viewport: { width, height: 1000 } })
  for (const scenario of ['normal', 'lost-response', 'invalid-json', 'stale-hold'] as const) test(scenario, async ({ page, localAuth }, info) => {
    const fixture = await createLocalCreditBooking(localAuth, { title: 'P'.repeat(150) }), db = localAuth.database
    try {
      // Only the purchase/receipt is synthetic. The form must create its own booking.
      await db.booking.delete({ where: { id: fixture.booking.id } })
      await db.availabilitySlot.createMany({ data: Array.from({ length: 7 }, (_, dayOfWeek) => ({ trainerProfileId: fixture.purchase.trainerProfileId,
        dayOfWeek, startTime: '08:00', endTime: '18:00' })) })
      const service = await db.serviceOffering.findUniqueOrThrow({ where: { id: fixture.booking.serviceOfferingId } })
      const sibling = await db.athleteProfile.create({ data: { parentProfileId: fixture.purchase.parentProfileId, firstName: 'Synthetic', lastName: 'Sibling',
        dateOfBirth: new Date('2016-01-01'), sports: { create: { sportId: service.sportId! } } } })
      const errors: string[] = [], sent: unknown[] = []
      page.on('pageerror', error => errors.push(error.message))
      await localAuth.signIn(fixture.parent)
      await page.goto('/parent/packages')
      await page.getByRole('link', { name: 'View session credits', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Book a package session', exact: true })).toBeVisible()
      await page.getByLabel('Session', { exact: true }).selectOption(service.id)
      await expect(page.getByText(`2 credits available for ${service.title}`, { exact: true })).toBeVisible()
      await page.getByLabel('Athlete', { exact: true }).selectOption(fixture.booking.athleteProfileId)
      const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
      await page.getByLabel('Date', { exact: true }).fill(date)
      await expect(page.getByLabel('Date', { exact: true })).toHaveCSS('color-scheme', 'dark')
      await expect(page.getByRole('button', { name: 'Refresh package availability', exact: true })).toHaveCSS('width', '40px')
      await page.getByLabel('Start time', { exact: true }).selectOption('09:00')
      await page.getByLabel('Session notes', { exact: true }).fill('Synthetic browser credit reservation')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.getByRole('button', { name: 'Reserve with 1 credit', exact: true }).scrollIntoViewIfNeeded()
      await page.screenshot({ path: info.outputPath('credit-reservation.png'), fullPage: true })
      await page.route('**/api/bookings/credits', async route => {
        if (route.request().method() !== 'POST') return route.continue()
        sent.push(route.request().postDataJSON())
        if (sent.length === 1 && (scenario === 'lost-response' || scenario === 'invalid-json')) {
          expect((await route.fetch()).status()).toBe(201)
          return scenario === 'lost-response' ? route.abort('failed') : route.fulfill({ status: 201, contentType: 'text/html', body: '<html>private-gateway-diagnostic</html>' })
        }
        return route.continue()
      })
      if (scenario === 'stale-hold') await db.packagePurchase.update({ where: { id: fixture.purchase.id }, data: { financialReview: { detail: 'private-provider-review' } } })
      await page.getByRole('button', { name: 'Reserve with 1 credit', exact: true }).click()
      if (scenario === 'stale-hold') {
        await expect(page.getByRole('alert').filter({ hasText: 'Package payment needs reconciliation' })).toBeVisible()
        await page.getByRole('button', { name: 'Refresh package availability', exact: true }).click()
        await expect(page.getByRole('button', { name: 'Reserve with 1 credit', exact: true })).toBeDisabled()
        expect(await db.booking.count({ where: { trainerProfileId: fixture.purchase.trainerProfileId } })).toBe(0)
        expect(await page.locator('body').innerText()).not.toContain('private-provider-review')
      } else {
        if (scenario !== 'normal') {
          await expect(page.getByRole('alert').filter({ hasText: 'Reservation could not be verified' })).toBeVisible()
          await expect(page.getByLabel('Session', { exact: true })).toBeDisabled()
          await expect(page.getByRole('button', { name: 'Reserve with 1 credit', exact: true })).toBeDisabled()
          expect(await page.locator('body').innerText()).not.toContain('private-gateway-diagnostic')
          await page.getByRole('button', { name: 'Retry same reservation', exact: true }).click()
        }
        await expect(page).toHaveURL(/\/parent\/dashboard$/)
        await expect(page.getByText('1 session credit used', { exact: true })).toBeVisible()
        expect(await db.booking.count({ where: { trainerProfileId: fixture.purchase.trainerProfileId } })).toBe(1)
        expect(await db.bookingCreateRequest.count({ where: { parentProfileId: fixture.purchase.parentProfileId } })).toBe(1)
        expect(await db.notification.count({ where: { userId: { in: [fixture.parent.id, fixture.trainer.id] } } })).toBe(2)
        if (scenario !== 'normal') { expect(sent).toHaveLength(2); expect(sent[1]).toEqual(sent[0]) }
        if (scenario === 'normal') {
          await page.goto(`/parent/packages/${fixture.purchase.id}/book`)
          await page.getByLabel('Session', { exact: true }).selectOption(service.id)
          await expect(page.getByText(`1 credit available for ${service.title}`, { exact: true })).toBeVisible()
          await page.getByLabel('Athlete', { exact: true }).selectOption(sibling.id)
          await page.getByLabel('Date', { exact: true }).fill(date)
          await page.getByLabel('Start time', { exact: true }).selectOption('10:00')
          await page.getByRole('button', { name: 'Reserve with 1 credit', exact: true }).click()
          await expect(page).toHaveURL(/\/parent\/dashboard$/)
          await expect(page.getByText('1 session credit used', { exact: true })).toHaveCount(2)
          const bookings = await db.booking.findMany({ where: { trainerProfileId: fixture.purchase.trainerProfileId } })
          expect(new Set(bookings.map(booking => booking.athleteProfileId)).size).toBe(2)
          await page.goto(`/parent/packages/${fixture.purchase.id}/book`)
          await expect(page.getByText('No session credits are available for booking.', { exact: true })).toBeVisible()
          await expect(page.getByRole('button', { name: 'Reserve with 1 credit', exact: true })).toBeDisabled()
        }
        await localAuth.signIn(fixture.trainer)
        await page.route('**/api/payments/connect', route => route.fulfill({ json: { providerConfigured: true, publishableKeyConfigured: true,
          stripeAccountId: null, stripeOnboardingComplete: false, chargesEnabled: null, payoutsEnabled: null, transfersEnabled: null, providerError: '', dashboardSupported: false, onboardingSupported: true } }))
        await page.route('**/api/trainer/wallet', route => route.fulfill({ json: { source: 'stripe', connected: false, wallet: null } }))
        await page.goto('/trainer/dashboard')
        await page.getByRole('tab', { name: `Confirmed (${scenario === 'normal' ? 2 : 1})`, exact: true }).click()
        await expect(page.getByText('Package credit', { exact: true })).toHaveCount(scenario === 'normal' ? 2 : 1)
      }
      expect(errors).toEqual([])
      expect(await db.payment.count({ where: { booking: { trainerProfileId: fixture.purchase.trainerProfileId } } })).toBe(0)
      expect(await db.walletEntry.count({ where: { booking: { trainerProfileId: fixture.purchase.trainerProfileId } } })).toBe(0)
    } finally { await fixture.cleanup() }
  })
  for (const mode of ['held', 'retired', 'read-failure', 'other-parent'] as const) test(`options ${mode}`, async ({ page, localAuth }) => {
    const fixture = await createLocalCreditBooking(localAuth), db = localAuth.database
    try {
      if (mode === 'held') await db.packagePurchase.update({ where: { id: fixture.purchase.id }, data: { financialReview: { detail: 'private-provider-review' } } })
      if (mode === 'retired') await db.serviceOffering.update({ where: { id: fixture.booking.serviceOfferingId }, data: { isActive: false } })
      await localAuth.signIn(mode === 'other-parent' ? await localAuth.create('PARENT') : fixture.parent)
      if (mode === 'read-failure') await page.route('**/api/bookings/credits?**', route => route.fulfill({ status: 503, json: { error: 'Synthetic failure' } }))
      await page.goto(`/parent/packages/${fixture.purchase.id}/book`)
      if (mode === 'read-failure' || mode === 'other-parent') {
        await expect(page.getByRole('alert').filter({ hasText: 'Unable to load current data' })).toBeVisible()
        await expect(page.getByLabel('Session', { exact: true })).toHaveCount(0)
        if (mode === 'read-failure') {
          await page.unroute('**/api/bookings/credits?**')
          await page.getByRole('button', { name: 'Refresh package availability', exact: true }).click()
          await expect(page.getByLabel('Session', { exact: true })).toBeVisible()
        }
      } else {
        await expect(page.getByText('No session credits are available for booking.', { exact: true })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Reserve with 1 credit', exact: true })).toBeDisabled()
        expect(await page.locator('body').innerText()).not.toContain('private-provider-review')
      }
      const response = await page.request.get(`/api/bookings/credits?purchaseId=${fixture.purchase.id}`)
      expect(response.status()).toBe(mode === 'other-parent' ? 404 : 200)
      expect(response.headers()['cache-control']).toBe('private, no-store')
      expect(JSON.stringify(await response.json())).not.toContain(fixture.purchase.stripePaymentIntentId!)
    } finally { await fixture.cleanup() }
  })
})
