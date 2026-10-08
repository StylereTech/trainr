import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveSessionUser } from '@/lib/session-user'
import { authOptions } from '@/lib/auth'

const mock = vi.hoisted(() => ({ user: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: mock.user } } }))
const claims = { sub: 'user', role: 'PARENT', sessionVersion: 3 }
const account = { id: 'user', email: 'current@example.test', image: null, role: 'PARENT', sessionVersion: 3,
  parentProfile: { id: 'parent' }, trainerProfile: { id: 'trainer' } }
beforeEach(() => { vi.resetAllMocks(); mock.user.mockResolvedValue(account) })

describe('current session identity', () => {
  it.each([null, {}, { ...claims, sub: '' }, { ...claims, sub: 12 }, { ...claims, sessionVersion: undefined },
    { ...claims, sessionVersion: '3' }, { ...claims, sessionVersion: -1 }, { ...claims, sessionVersion: 0.5 },
    { ...claims, sessionVersion: Number.MAX_SAFE_INTEGER + 1 }])('rejects invalid or pre-migration claims before querying: %j', async token => {
    expect(await resolveSessionUser(token)).toBeNull()
    expect(mock.user).not.toHaveBeenCalled()
  })
  it('uses current account fields and never reads credentials or exposes the revocation version', async () => {
    expect(await resolveSessionUser(claims)).toEqual({ id: 'user', role: 'PARENT', email: 'current@example.test', profileId: 'parent', image: null })
    const select = mock.user.mock.calls[0][0].select
    expect(select.passwordHash).toBeUndefined()
    expect(select.resetPasswordToken).toBeUndefined()
  })
  it.each(['PARENT', 'TRAINER', 'ADMIN'])('selects only the profile belonging to the current %s role', async role => {
    mock.user.mockResolvedValue({ ...account, role })
    expect((await resolveSessionUser({ ...claims, role }))?.profileId).toBe(role === 'PARENT' ? 'parent' : role === 'TRAINER' ? 'trainer' : null)
  })
  it.each([null, { ...account, deletedAt: new Date() }, { ...account, sessionVersion: 4 }, { ...account, role: 'ADMIN' }, { ...account, role: 'TRAINER' }])('rejects removed, revoked or role-changed accounts', async user => {
    mock.user.mockResolvedValue(user)
    expect(await resolveSessionUser(claims)).toBeNull()
  })
  it('fails closed during persistence errors without using stale cookie privileges', async () => {
    mock.user.mockRejectedValue(new Error('private database diagnostic'))
    expect(await resolveSessionUser(claims)).toBeNull()
  })
  it('issues the database version only at login, not from client session-update data', async () => {
    const token = await authOptions.callbacks.jwt({ token: {}, user: { id: 'user', role: 'PARENT', profileId: 'parent', sessionVersion: 3 } })
    expect(token.sessionVersion).toBe(3)
    const updated = await authOptions.callbacks.jwt({ token, trigger: 'update', session: { role: 'ADMIN', sessionVersion: 99, profileId: 'other' } })
    expect(updated).toEqual({ sub: 'user', role: 'PARENT', profileId: 'parent', sessionVersion: 3 })
  })
  it('returns fresh identity for the NextAuth session endpoint and server page guards', async () => {
    const session = await authOptions.callbacks.session({ session: { user: { email: 'old@example.test', role: 'ADMIN' }, expires: 'future' }, token: claims })
    expect(session).toEqual({ user: { id: 'user', email: 'current@example.test', image: null, role: 'PARENT', profileId: 'parent' }, expires: 'future' })
    expect(session.user.sessionVersion).toBeUndefined()
  })
  it('returns no NextAuth session for a revoked version', async () => {
    mock.user.mockResolvedValue({ ...account, sessionVersion: 4 })
    expect(await authOptions.callbacks.session({ session: { user: {} }, token: claims })).toBeNull()
  })
})
