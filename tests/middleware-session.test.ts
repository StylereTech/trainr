import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '@/middleware'

const mocks = vi.hoisted(() => ({ token: vi.fn() }))
vi.mock('next-auth/jwt', () => ({ getToken: mocks.token }))
beforeEach(() => vi.resetAllMocks())

describe('protected-page token prefilter', () => {
  it.each([null, { sub: 'user', role: 'PARENT' }, { sub: '', role: 'PARENT', sessionVersion: 0 },
    { sub: 'user', role: 'PARENT', sessionVersion: -1 }, { sub: 'user', role: 'PARENT', sessionVersion: 0.5 }])(
    'redirects absent or malformed version claims: %j', async token => {
      mocks.token.mockResolvedValue(token)
      const result = await middleware(new NextRequest('https://trainr.cc/parent/dashboard'))
      expect(result.status).toBe(307)
      expect(result.headers.get('location')).toContain('/auth/signin')
    })
  it.each(['__Secure-next-auth.session-token', 'next-auth.session-token'])('accepts valid signed claims from %s for further server verification', async cookie => {
    mocks.token.mockImplementation(async options => options.cookieName === cookie ? { sub: 'user', role: 'PARENT', sessionVersion: 0 } : null)
    const result = await middleware(new NextRequest('https://trainr.cc/parent/dashboard'))
    expect(result.headers.get('x-middleware-next')).toBe('1')
  })
  it('rejects a role mismatch', async () => {
    mocks.token.mockResolvedValue({ sub: 'user', role: 'PARENT', sessionVersion: 0 })
    const result = await middleware(new NextRequest('https://trainr.cc/admin'))
    expect(result.headers.get('location')).toBe('https://trainr.cc/dashboard')
  })
})
