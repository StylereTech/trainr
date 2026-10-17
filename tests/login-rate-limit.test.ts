import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ limit: vi.fn(), user: vi.fn(), compare: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: mocks.limit, getClientIp: () => '192.0.2.1' }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: mocks.user } } }))
vi.mock('bcryptjs', () => ({ default: { compare: mocks.compare } }))
import { authOptions } from '@/lib/auth'
const authorize = authOptions.providers[0].options.authorize
beforeEach(() => {
  vi.resetAllMocks()
  mocks.limit.mockResolvedValue({ allowed: true })
  mocks.user.mockResolvedValue({ id: 'parent', role: 'PARENT', email: 'parent@example.test', passwordHash: 'hashed', sessionVersion: 0 })
  mocks.compare.mockResolvedValue(true)
})
it('applies IP and normalized account budgets before looking up credentials', async () => {
  expect(await authorize({ email: ' PARENT@EXAMPLE.TEST ', password: 'Password-123' })).toMatchObject({ id: 'parent' })
  expect(mocks.limit.mock.calls).toEqual([['login-ip:192.0.2.1', 30, 900000], ['login-account:parent@example.test', 10, 900000]])
})
it.each([1, 2])('blocks exhausted or unavailable budget %s without credential lookup', async position => {
  if (position === 2) mocks.limit.mockResolvedValueOnce({ allowed: true })
  mocks.limit.mockResolvedValue({ allowed: false, unavailable: true })
  expect(await authorize({ email: 'parent@example.test', password: 'Password-123' })).toBeNull()
  expect(mocks.user).not.toHaveBeenCalled()
  expect(mocks.compare).not.toHaveBeenCalled()
})
it.each([{ email: 'a'.repeat(255), password: 'Password-123' }, { email: 'a@example.test', password: 'a'.repeat(73) }])('rejects oversized credentials before consuming resources', async credentials => {
  expect(await authorize(credentials)).toBeNull()
  expect(mocks.limit).not.toHaveBeenCalled()
  expect(mocks.user).not.toHaveBeenCalled()
})
