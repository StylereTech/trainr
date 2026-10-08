import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, PATCH } from '@/app/api/admin/users/route'
import { UserAdminActionError } from '@/lib/user-admin-actions'

const mock = vi.hoisted(() => ({ session: vi.fn(), action: vi.fn(), find: vi.fn(), count: vi.fn(), transaction: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getServerSession: mock.session }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findMany: mock.find, count: mock.count }, $transaction: mock.transaction } }))
vi.mock('@/lib/user-admin-actions', async original => ({ ...await original<typeof import('@/lib/user-admin-actions')>(), applyUserAdminAction: mock.action }))
const valid = { userId: 'user', action: 'change_role', role: 'PARENT', revision: '2026-10-08T00:00:00.000Z' }
const patch = (body: unknown) => PATCH(new NextRequest('http://localhost/api/admin/users', { method: 'PATCH', body: JSON.stringify(body) }))
beforeEach(() => {
  vi.resetAllMocks()
  mock.session.mockResolvedValue({ user: { id: 'admin', role: 'ADMIN' } })
  mock.action.mockResolvedValue({ id: 'user', role: 'PARENT' })
  mock.find.mockResolvedValue([])
  mock.count.mockResolvedValue(0)
  mock.transaction.mockImplementation(async queries => Promise.all(queries))
})

describe('administrator user HTTP boundaries', () => {
  it.each([null, { user: { id: 'parent', role: 'PARENT' } }, { user: { id: 'trainer', role: 'TRAINER' } }])('denies non-admin sessions', async session => {
    mock.session.mockResolvedValue(session)
    expect((await patch(valid)).status).toBe(401)
    expect((await GET(new NextRequest('http://localhost/api/admin/users'))).status).toBe(401)
    expect(mock.action).not.toHaveBeenCalled()
  })
  it.each([{}, { ...valid, revision: undefined }, { ...valid, revision: 'old' }, { ...valid, role: 'OWNER' },
    { ...valid, sessionVersion: 99 }, { ...valid, userId: '' }, { userId: 'user', revision: valid.revision, action: 'delete', reason: ' ' },
    { userId: 'user', revision: valid.revision, action: 'delete', reason: 'x'.repeat(2001) }])('rejects invalid or stale-contract inputs: %j', async input => {
    expect((await patch(input)).status).toBe(400)
    expect(mock.action).not.toHaveBeenCalled()
  })
  it('rejects malformed JSON', async () => {
    expect((await PATCH(new NextRequest('http://localhost/api/admin/users', { method: 'PATCH', body: '{' }))).status).toBe(400)
  })
  it('passes the reviewed version and current actor to the transaction', async () => {
    expect((await patch(valid)).status).toBe(200)
    expect(mock.action).toHaveBeenCalledWith('admin', valid)
  })
  it.each([400, 403, 404, 409])('preserves expected action failure %i', async status => {
    mock.action.mockRejectedValue(new UserAdminActionError('Expected conflict', status))
    expect((await patch(valid)).status).toBe(status)
  })
  it('does not expose database diagnostics for an uncertain mutation', async () => {
    mock.action.mockRejectedValue(new Error('private credentials in diagnostic'))
    const result = await patch(valid)
    expect(result.status).toBe(503)
    expect(await result.text()).not.toContain('private credentials')
  })
  it.each(['page=0', 'page=-1', 'page=1.5', 'page=abc', 'limit=101', 'limit=0', 'role=OWNER', 'search=' + 'x'.repeat(201), 'unknown=true'])('rejects invalid list parameters %s', async query => {
    expect((await GET(new NextRequest(`http://localhost/api/admin/users?${query}`))).status).toBe(400)
    expect(mock.find).not.toHaveBeenCalled()
  })
  it('uses bounded stable pagination and an explicit credential-free projection', async () => {
    const result = await GET(new NextRequest('http://localhost/api/admin/users?page=2&limit=10&role=TRAINER&search=Coach'))
    expect(result.status).toBe(200)
    const args = mock.find.mock.calls[0][0]
    expect(args).toMatchObject({ skip: 10, take: 10, where: { role: 'TRAINER' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] })
    expect(args.select.deletedAt).toBe(true)
    for (const field of ['passwordHash', 'resetPasswordToken', 'verificationToken', 'resetPasswordTokenSeed', 'verificationTokenSeed', 'sessionVersion']) expect(args.select[field]).toBeUndefined()
  })
  it('returns a retryable generic list error, not an empty successful result', async () => {
    mock.transaction.mockRejectedValue(new Error('private database connection'))
    const result = await GET(new NextRequest('http://localhost/api/admin/users'))
    expect(result.status).toBe(503)
    expect(await result.text()).not.toContain('private database')
  })
})
