import { beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { POST } from '@/app/api/admin/coupons/route'

const mock = vi.hoisted(() => ({ session: vi.fn(), create: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getServerSession: mock.session, authOptions: {} }))
vi.mock('@/lib/prisma', () => ({ prisma: { coupon: { create: mock.create } } }))

const post = (body: unknown) => POST(new NextRequest('http://localhost/api/admin/coupons', {
  method: 'POST', body: JSON.stringify(body),
}))

beforeEach(() => {
  vi.resetAllMocks()
  mock.session.mockResolvedValue({ user: { id: 'admin', role: 'ADMIN' } })
  mock.create.mockImplementation(async ({ data }) => ({ id: 'coupon', ...data }))
})

it.each([null, { user: { id: 'parent', role: 'PARENT' } }])('denies non-admin creation before parsing or writes', async session => {
  mock.session.mockResolvedValue(session)
  expect((await post({ code: 'LATE10', discountPercent: 10 })).status).toBe(401)
  expect(mock.create).not.toHaveBeenCalled()
})

it('creates a normalized one-use percentage code by default', async () => {
  const response = await post({ code: 'late-10', discountPercent: 10 })
  expect(response.status).toBe(201)
  expect(mock.create).toHaveBeenCalledWith({ data: expect.objectContaining({
    code: 'LATE10', discountPercent: 10, maxUses: 1, createdById: 'admin',
  }) })
})

it('allows an explicitly reviewed multi-use promotion', async () => {
  expect((await post({ code: 'SEASON20', discountPercent: 20, maxUses: 100 })).status).toBe(201)
  expect(mock.create).toHaveBeenCalledWith({ data: expect.objectContaining({ maxUses: 100 }) })
})

it.each([
  {}, { code: '!!!', discountPercent: 10 }, { code: 'OK', discountPercent: 10 },
  { code: 'BOTH', discountPercent: 10, discountAmountInCents: 100 },
  { code: 'NONE' }, { code: 'FRACTION', discountPercent: 10.5 },
  { code: 'FRACTION', discountPercent: 10, maxUses: 1.5 },
  { code: 'EXPIREDATE', discountPercent: 10, expiresAt: '2026-02-30' },
  { code: 'INVALIDDATE', discountPercent: 10, expiresAt: 'not-a-date' },
  { code: 'UNKNOWN', discountPercent: 10, currentUses: 0 },
])('rejects malformed financial settings without writes: %j', async body => {
  const response = await post(body)
  expect(response.status).toBe(400)
  expect(mock.create).not.toHaveBeenCalled()
})

it('rejects malformed JSON without writes', async () => {
  const response = await POST(new NextRequest('http://localhost/api/admin/coupons', { method: 'POST', body: '{' }))
  expect(response.status).toBe(400)
  expect(mock.create).not.toHaveBeenCalled()
})

it('returns a conflict without retrying a duplicate create', async () => {
  mock.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '6.19.3' }))
  expect((await post({ code: 'LATE10', discountPercent: 10 })).status).toBe(409)
  expect(mock.create).toHaveBeenCalledTimes(1)
})

it('does not expose a database diagnostic for an uncertain create', async () => {
  mock.create.mockRejectedValue(new Error('private database diagnostic'))
  const response = await post({ code: 'LATE10', discountPercent: 10 })
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain('private database diagnostic')
})
