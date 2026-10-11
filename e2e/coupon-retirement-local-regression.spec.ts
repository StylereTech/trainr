import { expect, test } from '@playwright/test'

test.skip(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(process.env.BASE_URL || ''), 'Requires the isolated loopback application.')

for (const [scenario, body] of [
  ['known-shaped coupon', JSON.stringify({ code: 'SAVE10' })],
  ['service-specific coupon', JSON.stringify({ code: 'SAVE10', serviceOfferingId: 'synthetic-service' })],
  ['unknown coupon', JSON.stringify({ code: 'SYNTHETIC_UNKNOWN' })],
  ['malformed JSON', '{'],
  ['empty body', ''],
  ['oversized input', JSON.stringify({ code: 'x'.repeat(50000) })],
]) test(`retired endpoint: ${scenario}`, async ({ request }) => {
  const response = await request.post('/api/coupons', { data: body, headers: { 'Content-Type': 'application/json' } })
  expect(response.status()).toBe(410)
  expect(response.headers()['cache-control']).toBe('private, no-store')
  expect(await response.json()).toEqual({
    error: 'Coupon validation has moved. Sign in as a parent and select a service to review its current price.',
    code: 'COUPON_ENDPOINT_RETIRED',
    quoteEndpoint: '/api/bookings/quote',
  })
})

for (const method of ['GET', 'PUT', 'PATCH', 'DELETE']) test(`retired endpoint does not offer ${method} validation`, async ({ request }) => {
  const response = await request.fetch('/api/coupons?code=SAVE10', { method })
  expect(response.status()).toBe(405)
  expect(await response.text()).toBe('')
})

for (const body of ['{', JSON.stringify({ serviceOfferingId: 'synthetic-service', couponCode: 'SAVE10' })]) {
  test(`replacement quote requires authentication before parsing ${body}`, async ({ request }) => {
    const response = await request.post('/api/bookings/quote', { data: body, headers: { 'Content-Type': 'application/json' } })
    expect(response.status()).toBe(401)
    expect(response.headers()['cache-control']).toBe('private, no-store')
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
  })
}
