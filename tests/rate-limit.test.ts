import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
import { getClientIp, rateLimit, rateLimitKey } from '@/lib/rate-limit'

beforeEach(() => { vi.stubEnv('VERCEL', '1'); vi.stubEnv('NEXTAUTH_SECRET', 'synthetic-rate-limit-key-never-for-production') })
afterEach(() => vi.unstubAllEnvs())

it('trusts only the platform IP header and canonicalizes IPv6', () => {
  const headers = new Headers({ 'x-vercel-forwarded-for': '2001:0db8:0000:0000:0000:0000:0000:0001', 'x-forwarded-for': '192.0.2.5', 'x-real-ip': '192.0.2.9' })
  expect(getClientIp({ headers })).toBe('2001:db8::1')
  headers.set('x-vercel-forwarded-for', ' 192.0.2.4 ')
  expect(getClientIp({ headers })).toBe('192.0.2.4')
  headers.delete('x-vercel-forwarded-for')
  expect(getClientIp({ headers })).toBe('unknown')
})
it.each(['', '192.0.2.1, 192.0.2.2', 'not-an-ip', '127.0.0.1:1234', '[::1]', 'fe80::1%eth0'])('groups invalid or ambiguous addresses: %s', value => {
  expect(getClientIp({ headers: new Headers({ 'x-vercel-forwarded-for': value }) })).toBe('unknown')
})
it('never trusts client platform headers outside Vercel runtime', () => {
  vi.stubEnv('VERCEL', '')
  expect(getClientIp({ headers: new Headers({ 'x-vercel-forwarded-for': '192.0.2.1' }) })).toBe('unknown')
})
it('stores opaque purpose/policy-separated keys, not IPs or email addresses', () => {
  const value = rateLimitKey('login-account:synthetic@example.test', 10, 900000)
  expect(value).toMatch(/^[a-f0-9]{64}$/)
  expect(value).not.toContain('synthetic')
  expect(rateLimitKey('login-account:synthetic@example.test', 10, 900000)).toBe(value)
  expect(rateLimitKey('login-ip:synthetic@example.test', 10, 900000)).not.toBe(value)
  expect(rateLimitKey('login-account:synthetic@example.test', 11, 900000)).not.toBe(value)
})
it.each([[0, 1000], [1, 0], [1001, 1000], [1, 86400001], [1.5, 1000]])('rejects invalid/bloated policies %j %j', (max, window) => {
  expect(() => rateLimitKey('key', max, window)).toThrow('Invalid rate limit policy')
})
it('fails closed without a usable key or database rather than falling back to process memory', async () => {
  vi.stubEnv('NEXTAUTH_SECRET', '')
  expect(await rateLimit('key', 1, 1000)).toMatchObject({ allowed: false, unavailable: true })
  vi.stubEnv('NEXTAUTH_SECRET', 'synthetic-rate-limit-key-never-for-production')
  expect(await rateLimit('key', 1, 1000)).toMatchObject({ allowed: false, unavailable: true })
})
