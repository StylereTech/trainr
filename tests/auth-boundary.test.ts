import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ token: vi.fn(), session: vi.fn(), user: vi.fn() }))
vi.mock('next-auth/jwt', () => ({ getToken: mocks.token }))
vi.mock('next-auth/next', () => ({ getServerSession: mocks.session }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: mocks.user } } }))

beforeEach(() => {
  vi.resetAllMocks()
  mocks.user.mockResolvedValue({ id: 'parent-1', email: 'parent@example.test', image: null, role: 'PARENT', sessionVersion: 0,
    parentProfile: { id: 'profile-1' }, trainerProfile: null })
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('Authentication trust boundary', () => {
  it('never forwards cookies to a caller-controlled host when token verification fails', async () => {
    mocks.token.mockResolvedValue(null)
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ user: { id: 'forged', role: 'ADMIN' } }))
    vi.stubGlobal('fetch', fetchMock)
    const { getRequestUser } = await import('@/lib/auth')
    const request = new NextRequest('https://trainr.cc/api/bookings', { headers: {
      'x-forwarded-host': 'attacker.invalid', 'x-forwarded-proto': 'https',
      cookie: 'next-auth.session-token=invalid',
    } })
    expect(await getRequestUser(request)).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.token).toHaveBeenCalledTimes(2)
  })

  it.each(['__Secure-next-auth.session-token', 'next-auth.session-token'])(
    'accepts a verified token from %s', async (cookieName) => {
      mocks.token.mockImplementation(async (options) => options.cookieName === cookieName
        ? { sub: 'parent-1', role: 'PARENT', sessionVersion: 0, email: 'stale@example.test', profileId: 'stale-profile' } : null)
      const { getRequestUser } = await import('@/lib/auth')
      expect(await getRequestUser(new NextRequest('https://trainr.cc/api/bookings'))).toEqual({
        id: 'parent-1', role: 'PARENT', email: 'parent@example.test', profileId: 'profile-1',
      })
    },
  )

  it('uses the configured authentication origin without mutating it per request', async () => {
    vi.stubEnv('NEXTAUTH_URL', 'https://trainr.cc')
    mocks.session.mockResolvedValue({ user: { id: 'parent-1' } })
    const { getServerSession, authOptions } = await import('@/lib/auth')
    expect(await getServerSession()).toEqual({ user: { id: 'parent-1' } })
    expect(mocks.session).toHaveBeenCalledWith(authOptions)
    expect(process.env.NEXTAUTH_URL).toBe('https://trainr.cc')
  })

  it.each([
    ['https://trainr.cc.attacker.invalid', 'https://trainr.cc'],
    ['//attacker.invalid', 'https://trainr.cc'],
    ['/parent/dashboard', 'https://trainr.cc/parent/dashboard'],
    ['https://trainr.cc/trainer/dashboard', 'https://trainr.cc/trainer/dashboard'],
  ])('redirects %s only to the application origin', async (url, expected) => {
    const { authOptions } = await import('@/lib/auth')
    expect(await authOptions.callbacks.redirect({ url, baseUrl: 'https://trainr.cc' })).toBe(expected)
  })
})
