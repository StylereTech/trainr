import { randomUUID } from 'node:crypto'
import { expect, test } from './fixtures/local-auth'

test.skip(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(process.env.BASE_URL || '') || !process.env.LOCAL_E2E_SECRET, 'Requires disposable loopback fixtures.')
test.use({ channel: process.env.LOCAL_E2E_CHANNEL || undefined })

for (const width of [1440, 390]) for (const role of ['PARENT', 'TRAINER'] as const) {
  test.describe(`${role} dashboard ${width}px`, () => {
    test.use({ viewport: { width, height: 1000 }, timezoneId: 'UTC' })
    test('reads every booking page and counts from real SQL, and reloads persisted actions', async ({ page, localAuth }, testInfo) => {
      const parent = await localAuth.create('PARENT'), trainer = await localAuth.create('TRAINER')
      const db = localAuth.database
      const parentProfile = await db.parentProfile.findUniqueOrThrow({ where: { userId: parent.id } })
      const trainerProfile = await db.trainerProfile.findUniqueOrThrow({ where: { userId: trainer.id } })
      const id = randomUUID()
      const sport = await db.sport.create({ data: { name: id, slug: id } })
      const service = await db.serviceOffering.create({ data: { trainerProfileId: trainerProfile.id, sportId: sport.id, title: 'Database session', durationMinutes: 60, priceInCents: 6000 } })
      const athlete = await db.athleteProfile.create({ data: { parentProfileId: parentProfile.id, firstName: 'Database', lastName: 'Athlete', dateOfBirth: new Date('2015-01-01') } })
      try {
        for (let index = 0; index < 24; index++) await db.booking.create({ data: { parentProfileId: parentProfile.id, trainerProfileId: trainerProfile.id, athleteProfileId: athlete.id, serviceOfferingId: service.id,
          date: new Date(Date.UTC(2030, 10, index + 1)), startTime: '09:00', endTime: '10:00', status: index < 12 ? 'PENDING' : index === 23 ? 'RESCHEDULED' : 'COMPLETED',
          totalAmountInCents: 6000, platformFeeInCents: 900, trainerPayoutInCents: 5100, notes: `Synthetic row ${index}`, payment: { create: { amountInCents: 6000, platformFeeInCents: 900, trainerPayoutInCents: 5100, status: 'SUCCEEDED' } } } })
        await localAuth.signIn(role === 'PARENT' ? parent : trainer)
        // Only external Stripe observations are simulated; booking/athlete reads and mutations are real HTTP + SQL.
        await page.route('**/api/payments/connect', route => route.fulfill({ json: { providerConfigured: true, publishableKeyConfigured: true, stripeAccountId: null, stripeOnboardingComplete: false, chargesEnabled: null, payoutsEnabled: null, providerError: '', dashboardSupported: false, onboardingSupported: true } }))
        let balanceReads = 0
        await page.route('**/api/trainer/wallet', route => { balanceReads++; return route.fulfill({ json: { source: 'stripe', connected: true, currency: 'usd', wallet: { availableBalance: 2500, pendingBalance: 1100 } } }) })
        await page.goto(`/${role.toLowerCase()}/dashboard`)
        await expect(page.getByRole('tab', { name: role === 'PARENT' ? 'Open (12)' : 'Pending (12)', exact: true })).toBeVisible()
        if (role === 'TRAINER') {
          await expect(page.getByTestId('trainer-balance')).toContainText('$25.00')
          await expect(page.getByText('Payment: SUCCEEDED', { exact: true }).first()).toBeVisible()
        }
        await page.screenshot({ path: testInfo.outputPath('dashboard-top.png') })
        await expect(page.getByRole('navigation', { name: 'Booking pages' })).toContainText('Page 1 of 2 (12 bookings)')
        await page.getByRole('button', { name: 'Next booking page' }).click()
        await expect(page.getByRole('navigation', { name: 'Booking pages' })).toContainText('Page 2 of 2 (12 bookings)')
        if (role === 'PARENT') {
          await page.getByRole('tab', { name: 'Past (12)', exact: true }).click()
          await expect(page.getByText('RESCHEDULED', { exact: true })).toBeVisible()
          await expect(page.getByRole('navigation', { name: 'Booking pages' })).toContainText('Page 1 of 2 (12 bookings)')
          await page.getByRole('button', { name: 'Next booking page' }).click()
          await expect(page.getByRole('button', { name: 'Leave Review', exact: true })).toHaveCount(2)
          await expect(page.getByText('Saved favorites', { exact: true })).toHaveCount(0)
        } else {
          await expect(page.getByTestId('trainer-balance')).toContainText('$25.00')
          await expect(page.getByText('Total earnings', { exact: true })).toHaveCount(0)
          await page.getByRole('button', { name: 'Confirm', exact: true }).first().click()
          await expect(page.getByRole('tab', { name: 'Pending (11)', exact: true })).toBeVisible()
          await expect(page.getByRole('button', { name: 'Confirm', exact: true })).toHaveCount(1)
          await page.getByRole('button', { name: 'Confirm', exact: true }).click()
          await expect(page.getByRole('navigation', { name: 'Booking pages' })).toContainText('Page 1 of 1 (10 bookings)')
          await expect(page.getByRole('tab', { name: 'Confirmed (2)', exact: true })).toBeVisible()
          expect(await db.booking.count({ where: { trainerProfileId: trainerProfile.id, status: 'CONFIRMED' } })).toBe(2)
          await page.getByRole('tab', { name: 'Confirmed (2)', exact: true }).click()
          let mutations = 0
          await page.route('**/api/bookings/*', async route => {
            if (route.request().method() !== 'PATCH') return route.continue()
            mutations++
            const response = await route.fetch()
            expect(response.status()).toBe(200)
            await route.abort('failed')
          })
          await page.getByRole('button', { name: 'Complete', exact: true }).first().click()
          await expect(page.getByRole('button', { name: 'Reload bookings', exact: true })).toBeVisible()
          for (const button of await page.getByRole('button', { name: 'Complete', exact: true }).all()) await expect(button).toBeDisabled()
          expect(await db.booking.count({ where: { trainerProfileId: trainerProfile.id, status: 'COMPLETED' } })).toBe(12)
          expect(mutations).toBe(1)
          await page.getByRole('button', { name: 'Reload bookings', exact: true }).click()
          await expect(page.getByRole('tab', { name: 'Confirmed (1)', exact: true })).toBeVisible()
          expect(mutations).toBe(1)
          await page.getByRole('tab', { name: 'All (24)', exact: true }).click()
          await expect(page.getByRole('navigation', { name: 'Booking pages' })).toContainText('Page 1 of 3 (24 bookings)')
        }
        const pager = page.getByRole('navigation', { name: 'Booking pages' })
        await pager.scrollIntoViewIfNeeded()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        await page.screenshot({ path: testInfo.outputPath('dashboard-pages.png') })
        expect(balanceReads).toBe(role === 'TRAINER' ? 1 : 0)
        await page.reload()
        await expect(page.getByRole('tab', { name: role === 'PARENT' ? 'Open (12)' : 'Pending (10)', exact: true })).toBeVisible()
      } finally {
        await db.booking.deleteMany({ where: { trainerProfileId: trainerProfile.id } })
        await db.serviceOffering.delete({ where: { id: service.id } })
        await db.sport.delete({ where: { id: sport.id } })
      }
    })
    test('recovers failed/malformed reads without reporting an empty account or zero funds', async ({ page, localAuth }) => {
      await localAuth.signIn(await localAuth.create(role))
      let bookingFailure = true, detailFailure = true
      await page.route('**/api/dashboard/bookings?*', route => bookingFailure ? route.fulfill({ status: 503, json: { error: 'Synthetic read failure' } }) : route.continue())
      await page.route('**/api/athletes', route => detailFailure ? route.fulfill({ json: {} }) : route.continue())
      await page.route('**/api/payments/connect', route => route.fulfill({ json: { providerConfigured: true, publishableKeyConfigured: true, stripeAccountId: null, stripeOnboardingComplete: false, chargesEnabled: null, payoutsEnabled: null, providerError: '', dashboardSupported: false, onboardingSupported: true } }))
      await page.route('**/api/trainer/wallet', route => detailFailure ? route.fulfill({ status: 503, json: { error: 'Synthetic provider unavailable' } }) : route.fulfill({ json: { source: 'stripe', connected: true, currency: 'usd', wallet: { availableBalance: -2500, pendingBalance: 1000 } } }))
      await page.goto(`/${role.toLowerCase()}/dashboard`)
      await expect(page.getByRole('alert').filter({ hasText: 'Unable to load current bookings.' })).toBeVisible()
      await expect(page.getByText(/No upcoming sessions|No bookings in this view/)).toHaveCount(0)
      bookingFailure = false
      await page.getByRole('button', { name: 'Retry bookings', exact: true }).click()
      if (role === 'PARENT') {
        await expect(page.getByRole('alert').filter({ hasText: 'Unable to load athletes.' })).toBeVisible()
        await expect(page.getByText('No athletes yet', { exact: true })).toHaveCount(0)
        detailFailure = false
        await page.getByRole('button', { name: 'Retry athletes', exact: true }).click()
        await expect(page.getByText('No athletes yet', { exact: true })).toBeVisible()
      } else {
        await expect(page.getByTestId('trainer-balance')).toContainText('Unavailable')
        await expect(page.getByTestId('trainer-balance')).not.toContainText('$0.00')
        detailFailure = false
        await page.getByRole('button', { name: 'Refresh Stripe balance' }).click()
        await expect(page.getByTestId('trainer-balance')).toContainText('-$25.00')
        await expect(page.getByTestId('trainer-balance')).toContainText('Pending: $10.00')
      }
    })
  })
}
