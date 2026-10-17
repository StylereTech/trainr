import { NextRequest } from 'next/server'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/coupons/route'

const invoke: (request: NextRequest) => Promise<Response> = POST

const mock = vi.hoisted(() => ({ coupon: vi.fn(), service: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  coupon: { findUnique: mock.coupon },
  serviceOffering: { findUnique: mock.service },
} }))

beforeEach(() => {
  vi.resetAllMocks()
  mock.coupon.mockResolvedValue({ id: 'private-coupon-id', code: 'SAVE10', isActive: true,
    currentUses: 0, maxUses: 50, discountPercent: 10, applicableSportId: 'private-sport-id' })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

it.each([
  ['coupon without service', JSON.stringify({ code: 'SAVE10' })],
  ['coupon with service', JSON.stringify({ code: 'SAVE10', serviceOfferingId: 'service' })],
  ['unknown coupon', JSON.stringify({ code: 'UNKNOWN' })],
  ['malformed JSON', '{'],
  ['missing body', ''],
  ['oversized input', JSON.stringify({ code: 'x'.repeat(50000) })],
])('retires %s without reading a body or coupon data', async (scenario, body) => {
  if (scenario === 'unknown coupon') mock.coupon.mockResolvedValue(null)
  const request = new NextRequest('http://localhost/api/coupons', { method: 'POST', body })
  const read = vi.spyOn(request, 'json')
  const response = await invoke(request)

  expect(response.status).toBe(410)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(await response.json()).toEqual({
    error: 'Coupon validation has moved. Sign in as a parent and select a service to review its current price.',
    code: 'COUPON_ENDPOINT_RETIRED',
    quoteEndpoint: '/api/bookings/quote',
  })
  expect(read).not.toHaveBeenCalled()
  expect(request.bodyUsed).toBe(false)
  expect(mock.coupon).not.toHaveBeenCalled()
  expect(mock.service).not.toHaveBeenCalled()
  expect(console.error).not.toHaveBeenCalled()
})

it('does not depend on database availability', async () => {
  mock.coupon.mockRejectedValue(new Error('synthetic database failure'))
  const response = await invoke(new NextRequest('http://localhost/api/coupons', {
    method: 'POST', body: JSON.stringify({ code: 'SAVE10' }),
  }))
  expect(response.status).toBe(410)
  expect(mock.coupon).not.toHaveBeenCalled()
  expect(console.error).not.toHaveBeenCalled()
})
