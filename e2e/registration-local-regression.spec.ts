import { randomUUID } from 'node:crypto'
import { expect, test } from './fixtures/local-auth'
import { deriveAccountToken, hashAccountToken } from '../src/lib/account-tokens'

test.use({ channel: process.env.LOCAL_E2E_CHANNEL || undefined })
test.skip(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(process.env.BASE_URL || '') || !process.env.LOCAL_E2E_SECRET, 'Registration fixtures require the guarded local server.')

test('signup waits for client initialization before accepting input', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  try {
    const page = await context.newPage()
    await page.goto(`${process.env.BASE_URL}/auth/signup?role=trainer`)
    await expect(page.getByLabel('First Name', { exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Create Trainer Account', includeHidden: true })).toBeDisabled()
  } finally {
    await context.close()
  }
})

for (const width of [1440, 390]) {
  for (const role of ['PARENT', 'TRAINER'] as const) {
    test(`real ${role} registration and explicit email verification at ${width}px`, async ({ page, localAuth }, testInfo) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      const clientIp = `192.0.2.${(width === 390 ? 10 : 20) + (role === 'PARENT' ? 1 : 2)}`
      await page.setExtraHTTPHeaders({ 'x-vercel-forwarded-for': clientIp })
      const email = `browser-registration-${randomUUID()}@example.test`
      try {
        await page.goto(`/auth/signup?role=${role.toLowerCase()}`)
        await page.getByLabel('First Name', { exact: true }).fill('Synthetic')
        await page.getByLabel('Last Name', { exact: true }).fill('Registration')
        await page.getByLabel('Email', { exact: true }).fill(email)
        await page.getByLabel('Password', { exact: true }).fill(localAuth.password)
        await page.getByLabel('Confirm Password', { exact: true }).fill(localAuth.password)
        await page.getByRole('checkbox').check()
        await page.getByRole('button', { name: role === 'PARENT' ? 'Create Parent Account' : 'Create Trainer Account' }).click()
        await expect(page).toHaveURL(/\/account\/verify-email$/)
        await expect(page.getByText('Not verified', { exact: true })).toBeVisible()
        const user = await localAuth.database.user.findUniqueOrThrow({ where: { email } })
        expect(user.role).toBe(role)
        expect(user.emailVerified).toBeNull()
        expect(user.verificationToken).toBeTruthy()
        await expect(page.locator('main img').first()).toBeVisible()
        expect(await page.locator('main img').first().evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        await page.getByRole('button', { name: 'Send verification email', exact: true }).click()
        await expect(page.getByRole('main').getByRole('alert')).toContainText('temporarily unavailable')
        await page.screenshot({ path: testInfo.outputPath('verification-unavailable.png') })
        await page.route('**/api/auth/verification-email', route => route.fulfill({ json: { status: 'accepted' } }))
        await page.getByRole('button', { name: 'Send verification email', exact: true }).click()
        await expect(page.getByRole('status').filter({ hasText: 'accepted for delivery' })).toBeVisible()
        await expect(page.getByText('Not verified', { exact: true })).toBeVisible()
        const verificationToken = deriveAccountToken('verification', user.id, user.verificationTokenSeed!, process.env.LOCAL_E2E_SECRET)
        expect(user.verificationToken).toBe(hashAccountToken('verification', verificationToken))
        await page.goto(`/account/verify-email?token=${verificationToken}`)
        expect((await localAuth.database.user.findUniqueOrThrow({ where: { email } })).emailVerified).toBeNull()
        await page.getByRole('button', { name: 'Verify email address', exact: true }).click()
        await expect(page.getByText('Your email address is verified.', { exact: true })).toBeVisible()
        await expect(page).toHaveURL(/\/account\/verify-email$/)
        await page.reload()
        await expect(page.getByText('Your email address is verified.', { exact: true })).toBeVisible()
        const verified = await localAuth.database.user.findUniqueOrThrow({ where: { email } })
        expect(verified.verificationToken).toBeNull()
        expect(verified.verificationTokenSeed).toBeNull()
        await page.screenshot({ path: testInfo.outputPath('verification-persisted.png') })
        await page.getByRole('link', { name: 'Continue to dashboard' }).click()
        await expect(page).toHaveURL(new RegExp(`/${role.toLowerCase()}/dashboard$`))
        expect((await page.request.post('/api/auth/forgot-password', { data: { email }, headers: { 'x-vercel-forwarded-for': clientIp } })).status()).toBe(200)
        const recovery = await localAuth.database.user.findUniqueOrThrow({ where: { email } })
        expect(recovery.resetPasswordToken).toBeTruthy()
        const resetToken = deriveAccountToken('reset', user.id, recovery.resetPasswordTokenSeed!, process.env.LOCAL_E2E_SECRET)
        expect(recovery.resetPasswordToken).toBe(hashAccountToken('reset', resetToken))
        await page.goto(`/auth/reset-password?token=${resetToken}`)
        await expect(page.getByLabel('New Password', { exact: true })).toBeVisible()
        await page.getByLabel('New Password', { exact: true }).fill('Changed-local-password-456')
        await page.getByLabel('Confirm Password', { exact: true }).fill('Changed-local-password-456')
        await page.getByRole('button', { name: 'Reset Password', exact: true }).click()
        await expect(page.getByText('Password reset!', { exact: true })).toBeVisible()
        expect((await localAuth.database.user.findUniqueOrThrow({ where: { email } })).resetPasswordTokenSeed).toBeNull()
        expect((await page.request.get('/api/auth/verify')).status()).toBe(401)
      } finally {
        await localAuth.database.user.deleteMany({ where: { email } })
      }
    })
  }
}
