import { beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const mocks = vi.hoisted(() => ({ limit: vi.fn(), email: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: mocks.limit, getClientIp: () => '192.0.2.1' }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/auth', () => ({ getRequestUser: async () => ({ id: 'user', role: 'PARENT' }) }))
vi.mock('@/lib/account-email', () => ({ requestAccountEmail: mocks.email }))
import { POST as register } from '@/app/api/auth/register/route'
import { POST as verify } from '@/app/api/auth/verify/route'
import { POST as reset } from '@/app/api/auth/reset-password/route'
import { POST as forgot } from '@/app/api/auth/forgot-password/route'
import { POST as resend } from '@/app/api/auth/verification-email/route'
const routes = [['register', register, 429], ['verify', verify, 429], ['reset', reset, 429], ['forgot', forgot, 200], ['resend', resend, 429]] as const
beforeEach(() => vi.resetAllMocks())
it.each(routes)('%s fails closed before side effects when the limiter is unavailable', async (_name, route) => {
  mocks.limit.mockResolvedValue({ allowed: false, remaining: 0, resetMs: 1000, unavailable: true })
  const response = await route(new NextRequest('http://localhost/api/auth/test', { method: 'POST', body: '{}' }))
  expect(response.status).toBe(503)
  expect(mocks.email).not.toHaveBeenCalled()
})
it.each(routes)('%s awaits the shared budget and keeps the expected throttled response', async (_name, route, status) => {
  mocks.limit.mockResolvedValue({ allowed: false, remaining: 0, resetMs: 1000 })
  const response = await route(new NextRequest('http://localhost/api/auth/test', { method: 'POST', body: '{}' }))
  expect(response.status).toBe(status)
  expect(mocks.email).not.toHaveBeenCalled()
})
