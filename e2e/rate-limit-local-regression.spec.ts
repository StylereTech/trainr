import { createHmac } from 'node:crypto'
import { test, expect } from './fixtures/local-auth'

test.skip(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(process.env.BASE_URL || '') || !process.env.LOCAL_E2E_SECRET, 'Disposable local database and simulated Vercel header only.')
test.use({ channel: process.env.LOCAL_E2E_CHANNEL || undefined })
const bucketHash = (key: string, max: number, window: number) => createHmac('sha256', process.env.LOCAL_E2E_SECRET!).update(JSON.stringify(['trainr-rate-limit-v1', key, max, window])).digest('hex')

for (const width of [1440, 390]) {
  test(`shared registration and credential budgets resist spoofed headers at ${width}px`, async ({ page, localAuth }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    const ip = width === 1440 ? '198.51.100.21' : '198.51.100.22'
    const user = await localAuth.create('PARENT')
    const keys = [bucketHash(`register:${ip}`, 5, 60000), bucketHash(`login-ip:${ip}`, 30, 900000), bucketHash(`login-account:${user.email}`, 10, 900000)]
    await page.setExtraHTTPHeaders({ 'x-vercel-forwarded-for': ip })
    try {
      for (let i = 0; i < 6; i++) {
        const response = await page.request.post('/api/auth/register', { data: {}, headers: { 'x-vercel-forwarded-for': ip, 'x-forwarded-for': `192.0.2.${i}`, 'x-real-ip': `192.0.2.${i}` } })
        expect(response.status()).toBe(i < 5 ? 400 : 429)
      }
      expect((await localAuth.database.rateLimitBucket.findUniqueOrThrow({ where: { keyHash: keys[0] } })).hits).toHaveLength(5)
      const csrf = await (await page.request.get('/api/auth/csrf', { headers: { 'x-vercel-forwarded-for': ip } })).json()
      for (let i = 0; i < 10; i++) {
        const response = await page.request.post('/api/auth/callback/credentials', { headers: { 'x-vercel-forwarded-for': ip }, form: { csrfToken: csrf.csrfToken, email: user.email, password: 'Wrong-password-123', json: 'true' } })
        expect((await response.json()).url).toContain('CredentialsSignin')
      }
      await page.goto('/auth/signin')
      await page.getByLabel('Email', { exact: true }).fill(user.email)
      await page.getByLabel('Password', { exact: true }).fill(localAuth.password)
      await page.locator('form').getByRole('button', { name: 'Sign In', exact: true }).click()
      await expect(page.getByText('Check your credentials or try again later.', { exact: true })).toBeVisible()
      expect((await page.request.get('/api/bookings')).status()).toBe(401)
      expect((await localAuth.database.rateLimitBucket.findUniqueOrThrow({ where: { keyHash: keys[2] } })).hits).toHaveLength(10)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath('login-throttled.png') })
    } finally { await localAuth.database.rateLimitBucket.deleteMany({ where: { keyHash: { in: keys } } }) }
  })
}
