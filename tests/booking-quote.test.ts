import { beforeEach, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/bookings/quote/route'
import { bookingQuoteSchema } from '@/lib/booking-quote-schema'

const mock = vi.hoisted(() => ({ user: vi.fn(), transaction: vi.fn(), service: vi.fn(), coupon: vi.fn(), fees: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getRequestUser: mock.user }))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: mock.transaction } }))
const offer = () => ({ id: 'service', isActive: true, priceInCents: 6000, sportId: 'sport', sport: { isActive: true },
  trainerProfile: { isActive: true, approvalStatus: 'APPROVED', sports: [{ sportId: 'sport' }] } })
const coupon = () => ({ id: 'coupon', code: 'SAVE10', discountPercent: 10, discountAmountInCents: null,
  isActive: true, currentUses: 0, maxUses: 1, applicableSportId: null, expiresAt: null })
const post = (body: unknown = { serviceOfferingId: 'service' }) => POST(new Request('http://localhost/api/bookings/quote', { method: 'POST', body: JSON.stringify(body) }) as any)

beforeEach(() => {
  vi.resetAllMocks()
  mock.user.mockResolvedValue({ id: 'parent', role: 'PARENT' })
  mock.service.mockResolvedValue(offer())
  mock.coupon.mockResolvedValue(coupon())
  mock.fees.mockResolvedValue([])
  // Deliberately expose no write methods: obtaining a quote must not reserve or consume.
  mock.transaction.mockImplementation(run => run({ serviceOffering: { findUnique: mock.service }, coupon: { findUnique: mock.coupon }, feeConfig: { findMany: mock.fees } }))
})
it.each([undefined, 'save-10'])('returns only validated USD price fields, without writes: %s', async couponCode => {
  const response = await post({ serviceOfferingId: 'service', couponCode })
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(await response.json()).toEqual({ serviceOfferingId: 'service', couponCode: couponCode ? 'SAVE10' : '', currency: 'usd',
    subtotalInCents: 6000, discountInCents: couponCode ? 600 : 0, totalAmountInCents: couponCode ? 5400 : 6000 })
  expect(mock.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'RepeatableRead' })
})
it.each(['TRAINER', 'ADMIN', undefined])('denies role %s before database queries', async role => {
  mock.user.mockResolvedValue({ id: 'user', role })
  expect((await post()).status).toBe(403)
  expect(mock.transaction).not.toHaveBeenCalled()
})
it('requires authentication', async () => {
  mock.user.mockResolvedValue(null)
  expect((await post()).status).toBe(401)
  expect(mock.transaction).not.toHaveBeenCalled()
})
it.each([{}, null, { serviceOfferingId: '' }, { serviceOfferingId: 'service', couponCode: 'x'.repeat(33) }, { serviceOfferingId: 'service', totalAmountInCents: 1 }])('rejects malformed or price-forging input %j', async input => {
  expect((await post(input)).status).toBe(400)
  expect(mock.transaction).not.toHaveBeenCalled()
})
it.each(['missing', 'inactive-service', 'inactive-trainer', 'pending', 'no-sport', 'inactive-sport', 'removed-sport'])('rejects ineligible catalog %s', async condition => {
  const service = offer()
  if (condition === 'inactive-service') service.isActive = false
  if (condition === 'inactive-trainer') service.trainerProfile.isActive = false
  if (condition === 'pending') service.trainerProfile.approvalStatus = 'PENDING'
  if (condition === 'no-sport') service.sportId = ''
  if (condition === 'inactive-sport') service.sport.isActive = false
  if (condition === 'removed-sport') service.trainerProfile.sports = []
  mock.service.mockResolvedValue(condition === 'missing' ? null : service)
  expect((await post()).status).toBe(409)
})
it.each([{ isActive: false }, { currentUses: 1 }, { expiresAt: new Date(0) }, { applicableSportId: 'other' },
  { discountPercent: 0 }, { discountPercent: 101 }, { discountPercent: 2.5 }, { discountPercent: null }, { discountAmountInCents: 100 },
  { discountPercent: null, discountAmountInCents: -1 }, { discountPercent: null, discountAmountInCents: 5951 }])('rejects invalid/exhausted/unchargeable coupon %j', async change => {
  mock.coupon.mockResolvedValue({ ...coupon(), ...change })
  expect((await post({ serviceOfferingId: 'service', couponCode: 'SAVE10' })).status).toBe(400)
})
it.each([{ discountPercent: 100 }, { discountPercent: null, discountAmountInCents: 9000 }])('quotes zero due without a Stripe charge %j', async change => {
  mock.coupon.mockResolvedValue({ ...coupon(), ...change })
  const response = await post({ serviceOfferingId: 'service', couponCode: 'SAVE10' })
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ subtotalInCents: 6000, discountInCents: 6000, totalAmountInCents: 0 })
})
it('enforces current platform minimum before coupons', async () => {
  mock.fees.mockResolvedValue([{ platformCommissionPercent: 15, stripeFeePercent: 2.9, processingFeeCents: 30, minBookingAmountCents: 7000 }])
  expect((await post()).status).toBe(409)
})
it('does not expose database credentials on failure', async () => {
  mock.transaction.mockRejectedValue(new Error('postgres://secret'))
  const response = await post()
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain('secret')
})
it.each([{ currency: 'eur' }, { totalAmountInCents: 1 }, { discountInCents: -1 }, { totalAmountInCents: 6001 }, { subtotalInCents: 6000.1 }])('rejects malformed client quote response %j', change => {
  expect(bookingQuoteSchema.safeParse({ serviceOfferingId: 'service', couponCode: '', currency: 'usd', subtotalInCents: 6000, discountInCents: 0, totalAmountInCents: 6000, ...change }).success).toBe(false)
})
