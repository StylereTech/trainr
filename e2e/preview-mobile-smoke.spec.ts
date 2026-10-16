import { expect, test } from '@playwright/test'
import { dashboardFixture } from './fixtures/dashboard'

const previewUrl = 'https://trainr-git-codex-payment-readiness-20261006-styleres-projects.vercel.app'

test.use({
  channel: process.env.LOCAL_E2E_CHANNEL || (process.platform === 'win32' ? 'chrome' : 'chromium'),
  viewport: { width: 390, height: 844 },
})

test.describe('isolated Preview mobile journeys', () => {
  test.skip(process.env.TRAINR_PREVIEW_ROLE_SMOKE !== '1', 'Requires the isolated Preview test accounts')
  test.setTimeout(90_000)

  async function signIn(page: import('@playwright/test').Page, role: 'PARENT' | 'TRAINER') {
    expect(process.env.BASE_URL).toBe(previewUrl)
    const email = process.env[`TRAINR_TEST_${role}_EMAIL`]
    const password = process.env[`TRAINR_TEST_${role}_PASSWORD`]
    expect(email, `${role} email must be supplied at runtime`).toBeTruthy()
    expect(password, `${role} password must be supplied at runtime`).toBeTruthy()
    await page.goto('/auth/signin')
    await page.getByLabel('Email').fill(email!)
    await page.getByLabel('Password').fill(password!)
    await page.getByRole('button', { name: 'Sign In' }).click()
    await expect(page).toHaveURL(new RegExp(`/${role.toLowerCase()}/dashboard$`))
  }

  async function expectFitsViewport(page: import('@playwright/test').Page) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }

  test('parent can find the trainer and sees the Stripe booking hold', async ({ page }, testInfo) => {
    await signIn(page, 'PARENT')
    await expect(page.getByRole('heading', { name: 'Parent dashboard' })).toBeVisible()
    await expectFitsViewport(page)

    await page.goto('/browse')
    await page.getByRole('button', { name: 'Remove state filter' }).click()
    await page.getByRole('link', { name: "View Audit Trainer's trainer profile" }).click()
    await expect(page.getByRole('heading', { name: 'Audit Trainer' })).toBeVisible()
    await expectFitsViewport(page)

    await page.getByRole('link', { name: 'Book Now' }).click()
    await page.getByRole('button', { name: /Synthetic Basketball Session/ }).click()
    await expect(page.getByText('Trainer must finish Stripe setup before a paid booking can be reserved.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Book & Pay' })).toBeDisabled()
    await expectFitsViewport(page)
    await page.screenshot({ path: testInfo.outputPath('preview-mobile-booking-hold.png'), fullPage: true })
  })

  test('trainer can read dashboard, packages and payout hold without mobile overflow', async ({ page }, testInfo) => {
    await signIn(page, 'TRAINER')
    await expect(page.getByRole('heading', { name: 'Trainer dashboard' })).toBeVisible()
    await expectFitsViewport(page)
    await page.goto('/trainer/packages')
    await expect(page.getByText('Synthetic', { exact: false }).first()).toBeVisible()
    await expectFitsViewport(page)
    await page.screenshot({ path: testInfo.outputPath('preview-mobile-trainer-packages.png'), fullPage: true })

    await page.goto('/trainer/profile?tab=payouts')
    await expect(page.getByRole('region', { name: 'Stripe earnings and payouts' })).toBeVisible()
    await expect(page.getByText('Setup in progress')).toBeVisible()
    await expect(page.getByText('Transfers not enabled')).toBeVisible()
    await expect(page.getByText('No bank payouts reported by Stripe yet.')).toBeVisible()
    await expectFitsViewport(page)
    await page.screenshot({ path: testInfo.outputPath('preview-mobile-trainer-payouts-hold.png'), fullPage: true })
  })

  test('parent can review a shared package and sees the Stripe checkout hold', async ({ page }, testInfo) => {
    await signIn(page, 'PARENT')
    await page.goto('/trainers/audit-trainer-20261016')
    await page.getByRole('tab', { name: 'Services' }).click()
    await expect(page.getByRole('link', { name: 'Review package' }).first()).toBeVisible()
    await page.getByRole('link', { name: 'Review package' }).first().click()
    await expect(page.getByRole('heading', { level: 1, name: 'Review package' })).toBeVisible()
    await expect(page.getByText('shared across your children')).toBeVisible()
    await expect(page.getByText('Trainer must finish Stripe setup before checkout.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Pay in full with Stripe' })).toHaveCount(0)
    await expectFitsViewport(page)
    await page.screenshot({ path: testInfo.outputPath('preview-mobile-package-hold.png'), fullPage: true })
  })

  test('parent can release an unpaid reservation without claiming a refund', async ({ page }, testInfo) => {
    await signIn(page, 'PARENT')
    const booking = {
      id: 'synthetic-unpaid-reservation', date: '2030-11-04', startTime: '09:00', endTime: '10:00', timeZone: 'UTC',
      startsAt: '2030-11-04T09:00:00.000Z', endsAt: '2030-11-04T10:00:00.000Z', status: 'PENDING',
      totalAmountInCents: 5000, trainerPayoutInCents: 4250, payment: null, creditFunding: null,
      serviceOffering: { title: 'Synthetic Basketball Session', durationMinutes: 60 },
      trainerProfile: { firstName: 'Audit', lastName: 'Trainer', paymentReady: true },
      athleteProfile: { firstName: 'Audit', lastName: 'Child' },
    }
    let cancelCalls = 0
    await page.route('**/api/dashboard/bookings?*', route => route.fulfill({ json: dashboardFixture([booking], route.request().url()) }))
    await page.route('**/api/bookings/synthetic-unpaid-reservation', route => {
      expect(route.request().method()).toBe('PATCH')
      expect(route.request().postDataJSON()).toEqual({ action: 'cancel' })
      cancelCalls++
      booking.status = 'CANCELLED'
      return route.fulfill({ json: { id: booking.id, status: booking.status, checkoutClosure: 'not_required' } })
    })
    await page.reload()
    await expect(page.getByRole('button', { name: 'Cancel reservation' })).toBeVisible()
    await expectFitsViewport(page)
    page.once('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'Cancel reservation' }).click()
    await expect(page.getByRole('tab', { name: 'Open (0)' })).toBeVisible()
    await expect(page.getByText('Cancellation is not a refund receipt.', { exact: false })).toBeVisible()
    expect(cancelCalls).toBe(1)
    await page.screenshot({ path: testInfo.outputPath('preview-mobile-unpaid-reservation-cancel.png'), fullPage: true })
  })
})
