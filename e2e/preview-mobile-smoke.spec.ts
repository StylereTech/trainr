import { expect, test } from '@playwright/test'

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

  test('trainer can read dashboard and packages without mobile overflow', async ({ page }, testInfo) => {
    await signIn(page, 'TRAINER')
    await expect(page.getByRole('heading', { name: 'Trainer dashboard' })).toBeVisible()
    await expectFitsViewport(page)
    await page.goto('/trainer/packages')
    await expect(page.getByText('Synthetic', { exact: false }).first()).toBeVisible()
    await expectFitsViewport(page)
    await page.screenshot({ path: testInfo.outputPath('preview-mobile-trainer-packages.png'), fullPage: true })
  })
})
