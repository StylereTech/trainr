import { expect, test } from '@playwright/test'
import { encode } from 'next-auth/jwt'

const origin = process.env.BASE_URL || ''
const secret = process.env.LOCAL_E2E_SECRET || ''
const local = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)
test.skip(!local || !secret, 'Synthetic API and session fixtures are restricted to an explicitly configured local server.')
test.use({ channel: process.env.LOCAL_E2E_CHANNEL || undefined })

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test.describe(`local booking UI ${viewport.width}px`, () => {
    test.use({ viewport, timezoneId: 'UTC' })

    for (const free of [false, true]) {
      test(free ? 'confirms zero-due booking without opening checkout' : 'keeps a failed checkout pending with a visible error', async ({ page, context }, testInfo) => {
        const token = await encode({ secret, token: { sub: 'local-parent', email: 'parent@example.test', role: 'PARENT' } })
        await context.addCookies([{ name: 'next-auth.session-token', value: token, url: origin }])
        const tomorrow = new Date()
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
        const date = tomorrow.toISOString().slice(0, 10)
        const day = tomorrow.getUTCDay()
        const trainer = {
          id: 'trainer', firstName: 'Test', lastName: 'Trainer', slug: 'local-fixture', headline: 'Training',
          avgRating: 0, totalReviews: 0, city: 'Austin', state: 'TX', locationType: 'IN_PERSON',
          stripeAccountId: 'acct_fixture', stripeOnboardingComplete: true,
          sports: [{ sport: { name: 'Basketball', icon: null } }],
          serviceOfferings: [{ id: 'service', title: 'Fixture session', description: null, durationMinutes: 60, priceInCents: 6000, type: 'INDIVIDUAL' }],
          availabilitySlots: [
            { dayOfWeek: day, specificDate: null, startTime: '09:00', endTime: '12:00', isRecurring: true, isAvailable: true },
            { dayOfWeek: null, specificDate: date, startTime: '09:30', endTime: '10:30', isRecurring: false, isAvailable: false },
          ],
        }
        const athlete = { id: 'athlete', firstName: 'Test', lastName: 'Athlete', sports: trainer.sports }
        let saved: any = null
        let checkoutCalls = 0
        await page.route('**/api/**', async (route) => {
          const path = new URL(route.request().url()).pathname
          if (path === '/api/trainers/local-fixture') return route.fulfill({ json: trainer })
          if (path === '/api/athletes') return route.fulfill({ json: { athletes: [athlete] } })
          if (path === '/api/auth/session') return route.fulfill({ json: { user: { id: 'local-parent', role: 'PARENT', email: 'parent@example.test' }, expires: '2099-01-01' } })
          if (path === '/api/bookings' && route.request().method() === 'POST') {
            expect(route.request().postDataJSON()).toMatchObject({ serviceOfferingId: 'service', athleteProfileId: 'athlete', date, startTime: '11:00' })
            saved = { id: 'booking', date, startTime: '11:00', endTime: '12:00', status: free ? 'CONFIRMED' : 'PENDING',
              totalAmountInCents: free ? 0 : 6000, payment: free ? { status: 'SUCCEEDED' } : null,
              serviceOffering: trainer.serviceOfferings[0], trainerProfile: trainer, athleteProfile: athlete, review: null }
            return route.fulfill({ status: 201, json: saved })
          }
          if (path === '/api/bookings') return route.fulfill({ json: { bookings: saved ? [saved] : [] } })
          if (path === '/api/payments/checkout') {
            checkoutCalls++
            return route.fulfill({ status: 503, json: { error: 'Fixture checkout unavailable. Booking remains unpaid.' } })
          }
          return route.fulfill({ json: {} })
        })
        await page.goto('/book/local-fixture')
        await page.getByRole('button', { name: /Fixture session/ }).click()
        await page.getByRole('combobox').click()
        await page.getByRole('option', { name: /Test Athlete/ }).click()
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        await page.getByRole('button', { name: `${days[day]} ${tomorrow.getUTCDate()}`, exact: true }).click()
        await expect(page.getByRole('button', { name: '09:00', exact: true })).toHaveCount(0)
        await expect(page.getByRole('button', { name: '10:00', exact: true })).toHaveCount(0)
        await page.getByRole('button', { name: '11:00', exact: true }).click()
        if (free) await page.getByLabel('Promo code').fill('FREE100')
        if (viewport.width < 1024) await page.getByRole('button', { name: /Booking summary/ }).click()
        const submit = page.getByRole('button', { name: 'Book & Pay', exact: true })
        await submit.scrollIntoViewIfNeeded()
        await expect(submit).toBeEnabled()
        await page.screenshot({ path: testInfo.outputPath('booking-selected.png') })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        await submit.click()
        await expect(page).toHaveURL(/\/parent\/dashboard$/)
        await expect(page.getByText(free ? 'No payment is due.' : 'Fixture checkout unavailable. Booking remains unpaid.', { exact: true })).toBeVisible()
        expect(checkoutCalls).toBe(free ? 0 : 1)
        await page.screenshot({ path: testInfo.outputPath('booking-result.png') })
        await page.goto('/parent/dashboard?payment=success')
        await expect(page.getByRole('heading', { name: 'My Athletes' })).toBeVisible()
        await expect(page.getByText('Payment completed', { exact: true })).toHaveCount(0)
        if (free) {
          await expect(page.getByText('No payment due', { exact: true })).toBeVisible()
          await expect(page.getByRole('button', { name: 'Pay now', exact: true })).toHaveCount(0)
        } else {
          await expect(page.getByText('Awaiting payment', { exact: true })).toBeVisible()
          await page.getByRole('button', { name: 'Pay now', exact: true }).click()
          await expect(page.getByText('Unable to start checkout', { exact: true })).toBeVisible()
          expect(checkoutCalls).toBe(2)
        }
        await page.screenshot({ path: testInfo.outputPath('booking-recovery.png') })
      })
    }
  })
}
