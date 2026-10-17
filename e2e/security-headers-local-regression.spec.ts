import { expect, test } from './fixtures/local-auth'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

test.skip(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(process.env.BASE_URL || '') || !process.env.LOCAL_E2E_SECRET, 'Requires disposable loopback fixtures.')
test.use({ channel: process.env.LOCAL_E2E_CHANNEL || undefined })

function protectedHeaders(headers: Record<string, string>) {
  expect(headers['content-security-policy']).toBe("frame-ancestors 'none'")
  expect(headers['x-frame-options']).toBe('DENY')
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['referrer-policy']).toBe('no-referrer')
}

for (const [path, status] of [
  ['/auth/signin', 200], ['/auth/signup', 200], ['/account/verify-email', 200],
  ['/parent/dashboard', 307], ['/api/bookings', 401], ['/api/auth/session', 200], ['/header-audit-not-found', 404],
] as const) test(`response headers: ${path}`, async ({ request }) => {
  const response = await request.get(path, { maxRedirects: 0 })
  expect(response.status()).toBe(status)
  protectedHeaders(response.headers())
})

test('unsigned webhook rejection retains protection headers', async ({ request }) => {
  const response = await request.post('/api/payments/webhook', { data: {} })
  expect(response.status()).toBe(400)
  protectedHeaders(response.headers())
})

for (const origin of ['same-origin', 'cross-origin']) test(`disallows framed sign-in from ${origin}`, async ({ page }, info) => {
  const blocked: string[] = []
  page.on('console', message => { if (/frame-ancestors|X-Frame-Options/i.test(message.text())) blocked.push(message.text()) })
  const target = new URL('/auth/signin', process.env.BASE_URL).href
  const body = `<!doctype html><title>Synthetic framing test</title><iframe title="Target sign-in" src="${target}"></iframe>`
  let server: ReturnType<typeof createServer> | undefined
  try {
    const harness = new URL('/header-frame-fixture', process.env.BASE_URL)
    if (origin === 'cross-origin') {
      // A real loopback response supplies address-space evidence without granting network permissions.
      server = createServer((_request, response) => { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end(body) })
      await new Promise<void>((resolve, reject) => { server!.once('error', reject); server!.listen(0, '127.0.0.1', resolve) })
      harness.hostname = '127.0.0.1'
      harness.port = String((server.address() as AddressInfo).port)
    } else {
      await page.route(harness.href, route => route.fulfill({ contentType: 'text/html', body }))
    }
    await page.goto(harness.href)
    await expect.poll(() => blocked.length).toBeGreaterThan(0)
    await expect(page.frameLocator('iframe').getByRole('button', { name: 'Sign In', exact: true })).toHaveCount(0)
    await page.screenshot({ path: info.outputPath('framing-blocked.png') })
  } finally {
    if (server?.listening) {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()))
    }
  }
})

test('normal navigation renders scripts and styles without sending a referrer', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/browse?auditContext=synthetic-referrer-marker')
  await expect(page.getByRole('heading', { name: 'Find a coach who actually fits your athlete.', exact: true })).toBeVisible()
  const destination = await page.locator('a[href="/auth/signup"]').first().getAttribute('href')
  expect(destination).toBe('/auth/signup')
  const navigation = page.waitForRequest(request => request.isNavigationRequest() && new URL(request.url()).pathname === '/auth/signup')
  // Exercise document referrer policy rather than a cached Next client transition.
  await page.evaluate(path => window.location.assign(path!), destination)
  expect((await navigation).headers().referer).toBeUndefined()
  await expect(page.getByRole('heading', { name: 'Create your account', exact: true })).toBeVisible()
  const assets = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => ({ name: entry.name, size: (entry as PerformanceResourceTiming).decodedBodySize })))
  expect(assets.some(asset => asset.name.includes('/_next/') && asset.name.includes('.css') && asset.size > 0)).toBe(true)
  expect(errors).toEqual([])
  await page.screenshot({ path: info.outputPath('normal-navigation.png') })
})

for (const role of ['PARENT', 'TRAINER', 'ADMIN'] as const) test(`authenticated ${role} top-level dashboard remains usable`, async ({ page, localAuth }) => {
  await localAuth.signIn(await localAuth.create(role))
  const path = role === 'ADMIN' ? '/admin' : `/${role.toLowerCase()}/dashboard`
  const response = await page.goto(path)
  expect(response?.status()).toBe(200)
  protectedHeaders((await response?.allHeaders()) || {})
  await expect(page.getByRole('link', { name: 'Sign Out', exact: true }).or(page.getByRole('button', { name: 'Sign Out', exact: true }))).toBeVisible()
  expect(new URL(page.url()).pathname).toBe(path)
})
