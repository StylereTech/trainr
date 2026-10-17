import { randomUUID } from 'node:crypto'
import { expect, test } from './fixtures/local-auth'

test.skip(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(process.env.BASE_URL || '') || !process.env.LOCAL_E2E_SECRET, 'Requires disposable loopback fixtures.')
test.use({ channel: process.env.LOCAL_E2E_CHANNEL || undefined })

for (const width of [1440, 390]) for (const entry of ['dashboard', 'booking'] as const) {
  test.describe(`checkout ${entry} ${width}px`, () => {
    test.use({ viewport: { width, height: 1000 }, timezoneId: 'America/Los_Angeles' })
    for (const scenario of ['processing', 'timeout', 'invalid-error', 'invalid-json', 'unsafe-url', 'success'] as const) {
      test(`recovers ${scenario} without duplicating or claiming payment`, async ({ page, localAuth }, testInfo) => {
        // The real 15s abort, reservation, retry and reload share this budget; recovery assertions remain 20s.
        if (scenario === 'timeout') test.setTimeout(60_000)
        const db = localAuth.database
        const parent = await localAuth.create('PARENT'), trainer = await localAuth.create('TRAINER')
        const parentProfile = await db.parentProfile.findUniqueOrThrow({ where: { userId: parent.id } })
        const id = randomUUID()
        const sport = await db.sport.create({ data: { name: `Synthetic ${id}`, slug: id } })
        const tomorrow = new Date()
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
        const date = tomorrow.toISOString().slice(0, 10), day = tomorrow.getUTCDay()
        let releaseRequest: (() => void) | undefined
        const heldRequest = new Promise<void>(resolve => { releaseRequest = resolve })
        try {
          const athlete = await db.athleteProfile.create({ data: { parentProfileId: parentProfile.id, firstName: 'Synthetic', lastName: 'Athlete', dateOfBirth: new Date('2015-01-01'), goals: [], sports: { create: { sportId: sport.id } } } })
          const profile = await db.trainerProfile.update({ where: { userId: trainer.id }, data: { approvalStatus: 'APPROVED', isActive: true, timeZone: 'UTC',
            stripeAccountId: `acct_synthetic_${id}`, stripeOnboardingComplete: true,
            sports: { create: { sportId: sport.id } }, serviceOfferings: { create: { title: 'Synthetic checkout session', sportId: sport.id, priceInCents: 6000, durationMinutes: 60 } },
            availabilitySlots: { create: { dayOfWeek: day, startTime: '09:00', endTime: '12:00' } },
          }, include: { serviceOfferings: true } })
          if (entry === 'dashboard') await db.booking.create({ data: { parentProfileId: parentProfile.id, trainerProfileId: profile.id,
            athleteProfileId: athlete.id, serviceOfferingId: profile.serviceOfferings[0].id, date: new Date(date), startTime: '09:00', endTime: '10:00', timeZone: 'UTC', startsAt: new Date(`${date}T09:00:00Z`), endsAt: new Date(`${date}T10:00:00Z`),
            totalAmountInCents: 6000, platformFeeInCents: 900, trainerPayoutInCents: 5100 } })
          await localAuth.signIn(parent)
          const pageErrors: string[] = [], checkoutIds: string[] = []
          let unsafeNavigations = 0, validNavigations = 0, retry = false
          page.on('pageerror', error => pageErrors.push(error.message))
          // Provider navigation and checkout responses are simulated; reservation and dashboard reads use real local HTTP/SQL.
          await page.route('https://checkout.stripe.com/**', route => {
            validNavigations++
            return route.fulfill({ contentType: 'text/html', body: '<h1>Synthetic checkout destination</h1>' })
          })
          await page.route('https://untrusted-checkout.example.test/**', route => {
            unsafeNavigations++
            return route.fulfill({ contentType: 'text/html', body: '<h1>Unexpected destination</h1>' })
          })
          await page.route('**/api/payments/checkout', async route => {
            const bookingId = route.request().postDataJSON().bookingId
            checkoutIds.push(bookingId)
            expect(await db.booking.count({ where: { id: bookingId, parentProfileId: parentProfile.id } })).toBe(1)
            if (retry || scenario === 'success') return route.fulfill({ json: { checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_synthetic' } })
            if (scenario === 'timeout') { await heldRequest; return route.abort().catch(() => {}) }
            if (scenario === 'unsafe-url') return route.fulfill({ json: { checkoutUrl: 'https://untrusted-checkout.example.test/pay' } })
            if (scenario === 'invalid-json') return route.fulfill({ contentType: 'text/html', body: '<html>Service unavailable</html>' })
            if (scenario === 'invalid-error') return route.fulfill({ status: 503, json: { error: { unexpected: 'not renderable text' } } })
            await db.payment.create({ data: { bookingId, amountInCents: 6000, platformFeeInCents: 900, trainerPayoutInCents: 5100, status: 'PROCESSING' } })
            return route.fulfill({ status: 409, json: { error: 'Payment is already processing.' } })
          })
          if (entry === 'dashboard') {
            await page.goto('/parent/dashboard')
            await page.getByRole('button', { name: 'Pay now', exact: true }).click()
          } else {
            await page.goto(`/book/${profile.slug}`)
            await page.getByRole('button', { name: /Synthetic checkout session/ }).click()
            await page.getByRole('combobox').click()
            await page.getByRole('option', { name: /Synthetic Athlete/ }).click()
            await page.getByRole('button', { name: `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day]} ${tomorrow.getUTCDate()}`, exact: true }).click()
            await page.getByRole('button', { name: '09:00', exact: true }).click()
            await expect(page.getByRole('heading', { name: 'Review booking', exact: true })).toBeVisible()
            await page.getByRole('button', { name: 'Book & Pay', exact: true }).click()
          }
          if (scenario !== 'success') {
            if (entry === 'booking') await expect(page).toHaveURL(/\/parent\/dashboard$/, { timeout: scenario === 'timeout' ? 20000 : 10000 })
            await expect(page.getByRole('heading', { name: 'Parent dashboard', exact: true })).toBeVisible()
            if (scenario === 'processing') {
              await expect(page.getByText('Payment: PROCESSING', { exact: true })).toBeVisible()
              await expect(page.getByText('Payment processing', { exact: true })).toBeVisible()
              await expect(page.getByText('Awaiting payment', { exact: true })).toHaveCount(0)
              await expect(page.getByRole('button', { name: 'Pay now', exact: true })).toHaveCount(0)
            } else {
              await expect(page.getByRole('button', { name: 'Pay now', exact: true })).toBeEnabled({ timeout: scenario === 'timeout' ? 20000 : 10000 })
              await expect(page.getByText('Payment not recorded', { exact: true })).toBeVisible()
            }
            if (entry === 'dashboard') await expect(page.getByRole('alert').filter({ hasText: 'Checkout could not be opened' })).toBeVisible()
            expect(checkoutIds).toHaveLength(1)
            expect(unsafeNavigations).toBe(0)
            expect(validNavigations).toBe(0)
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
            await page.screenshot({ path: testInfo.outputPath('checkout-recovery.png'), fullPage: true })
            if (scenario !== 'processing') {
              retry = true
              releaseRequest?.()
              await page.getByRole('button', { name: 'Pay now', exact: true }).click()
            }
          }
          if (scenario !== 'processing') {
            await expect(page.getByRole('heading', { name: 'Synthetic checkout destination', exact: true })).toBeVisible()
            expect(validNavigations).toBe(1)
            expect(new Set(checkoutIds).size).toBe(1)
          }
          expect(checkoutIds).toHaveLength(scenario === 'success' || scenario === 'processing' ? 1 : 2)
          expect(pageErrors).toEqual([])
          const saved = await db.booking.findMany({ where: { parentProfileId: parentProfile.id }, include: { payment: true } })
          expect(saved).toHaveLength(1)
          expect(saved[0].status).toBe('PENDING')
          expect(saved[0].payment?.status ?? null).toBe(scenario === 'processing' ? 'PROCESSING' : null)
          await page.goto('/parent/dashboard')
          await expect(page.getByText(scenario === 'processing' ? 'Payment: PROCESSING' : 'Payment not recorded', { exact: true })).toBeVisible()
          await expect(page.getByText('Paid', { exact: true })).toHaveCount(0)
          expect(await db.bookingCreateRequest.count({ where: { parentProfileId: parentProfile.id } })).toBe(entry === 'booking' ? 1 : 0)
        } finally {
          releaseRequest?.()
          await db.booking.deleteMany({ where: { parentProfileId: parentProfile.id } })
          await db.user.deleteMany({ where: { id: { in: [parent.id, trainer.id] } } })
          await db.sport.delete({ where: { id: sport.id } })
        }
      })
    }
  })
}
