import { expect, test } from './fixtures/local-auth'

test.skip(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(process.env.BASE_URL || '') || !process.env.LOCAL_E2E_SECRET,
  'Requires disposable loopback fixtures.')
test.use({ channel: process.env.LOCAL_E2E_CHANNEL || undefined })

for (const role of ['ANONYMOUS', 'TRAINER', 'ADMIN', 'PARENT'] as const) test(`package sales HTTP rejects ${role} without provider access`, async ({ page, localAuth }) => {
  if (role !== 'ANONYMOUS') await localAuth.signIn(await localAuth.create(role))
  const response = await page.request.post('/api/package-purchases/checkout', { data: { purchaseId: 'missing', parentId: 'forbidden-input' } })
  expect(response.status()).toBe(role === 'ANONYMOUS' ? 401 : role === 'PARENT' ? 400 : 403)
  expect(response.headers()['cache-control']).toBe('private, no-store')
  expect(await response.json()).toEqual({ error: expect.any(String) })
})
