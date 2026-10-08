import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { PATCH } from '@/app/api/admin/trainers/[id]/route'
import { applyTrainerAdminAction, trainerAdminActionSchema } from '@/lib/trainer-admin-actions'

const mock = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn(), session: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: mock.transaction } }))
vi.mock('@/lib/auth', () => ({ getServerSession: mock.session, authOptions: {} }))
const revision = '2026-10-08T00:00:00.000Z'
let state: any
let fail: 'audit' | 'notification' | null
const approve = () => applyTrainerAdminAction('trainer', 'admin', { action: 'approve', revision })
const request = (body: unknown) => PATCH(new NextRequest('http://localhost/api/admin/trainers/trainer', {
  method: 'PATCH', body: JSON.stringify(body),
}), { params: Promise.resolve({ id: 'trainer' }) })

beforeEach(() => {
  vi.resetAllMocks()
  mock.session.mockResolvedValue({ user: { id: 'admin', role: 'ADMIN' } })
  fail = null
  state = { actor: { role: 'ADMIN' }, trainer: { id: 'trainer', userId: 'trainer-user', firstName: 'Synthetic', lastName: 'Trainer',
    approvalStatus: 'PENDING', approvedAt: null, rejectedReason: null, isActive: true, featured: false, updatedAt: new Date(revision) }, audits: [], notifications: [] }
  let tail = Promise.resolve()
  mock.transaction.mockImplementation(async run => {
    const previous = tail
    let release!: () => void
    tail = new Promise<void>(resolve => { release = resolve })
    await previous
    const before = structuredClone(state)
    try {
      return await run({
        $queryRaw: mock.query,
        user: { findUnique: async () => state.actor },
        trainerProfile: {
          findUnique: async () => state.trainer,
          update: async ({ data }: any) => { state.trainer = { ...state.trainer, ...data }; return state.trainer },
        },
        adminAction: { create: async ({ data }: any) => {
          if (fail === 'audit') throw new Error('private database diagnostic')
          state.audits.push(data)
        } },
        notification: { create: async ({ data }: any) => {
          if (fail === 'notification') throw new Error('private notification diagnostic')
          state.notifications.push(data)
        } },
      })
    } catch (error) {
      state = before
      throw error
    } finally { release() }
  })
})
afterEach(() => vi.restoreAllMocks())

describe('trainer eligibility decisions', () => {
  it('atomically approves with a truthful notification and before/after audit', async () => {
    const updated = await approve()
    expect(updated.approvalStatus).toBe('APPROVED')
    expect(updated.updatedAt.getTime()).toBeGreaterThan(Date.parse(revision))
    expect(state.audits).toHaveLength(1)
    expect(state.audits[0].metadata).toMatchObject({ previousStatus: 'PENDING', status: 'APPROVED', previousRevision: revision })
    expect(state.notifications).toHaveLength(1)
    expect(state.notifications[0].message).toContain('payment setup')
    expect(mock.query.mock.calls.map(call => call[0].join('?'))).toEqual([
      'SELECT id FROM users WHERE id = ? FOR SHARE', 'SELECT id FROM trainer_profiles WHERE id = ? FOR UPDATE',
    ])
  })
  it.each(['audit', 'notification'] as const)('rolls all writes back if the %s insert fails, and allows a clean retry', async point => {
    fail = point
    await expect(approve()).rejects.toThrow('private')
    expect(state.trainer).toMatchObject({ approvalStatus: 'PENDING', approvedAt: null, updatedAt: new Date(revision) })
    expect(state.audits).toHaveLength(0)
    expect(state.notifications).toHaveLength(0)
    fail = null
    await expect(approve()).resolves.toMatchObject({ approvalStatus: 'APPROVED' })
    expect(state.audits).toHaveLength(1)
    expect(state.notifications).toHaveLength(1)
  })
  it('permits only one decision from the same reviewed revision', async () => {
    const results = await Promise.allSettled([approve(), applyTrainerAdminAction('trainer', 'admin', { action: 'reject', reason: 'Incomplete application', revision })])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { status: 409 } })
    expect(state.audits).toHaveLength(1)
    expect(state.notifications).toHaveLength(1)
  })
  it('rejects a profile changed since it was reviewed', async () => {
    state.trainer.updatedAt = new Date(Date.parse(revision) + 1)
    await expect(approve()).rejects.toMatchObject({ status: 409 })
    expect(state.audits).toHaveLength(0)
  })
  it('advances revisions even if the wall clock has not advanced', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse(revision))
    expect((await approve()).updatedAt.toISOString()).toBe('2026-10-08T00:00:00.001Z')
  })
  it.each(['PARENT', 'TRAINER', null])('rejects a stale admin token when the database actor is %s', async role => {
    state.actor = role ? { role } : null
    expect((await request({ action: 'approve', revision })).status).toBe(403)
    expect(state.trainer.approvalStatus).toBe('PENDING')
    expect(state.audits).toHaveLength(0)
  })
  it('returns not found without any writes', async () => {
    state.trainer = null
    expect((await request({ action: 'approve', revision })).status).toBe(404)
    expect(state.audits).toHaveLength(0)
  })
  it.each(['reject', 'suspend'] as const)('persists the %s reason with one notification', async action => {
    const input = trainerAdminActionSchema.parse({ action, revision, reason: '  Missing details  ' })
    const updated = await applyTrainerAdminAction('trainer', 'admin', input)
    expect(updated).toMatchObject({ approvalStatus: action === 'reject' ? 'REJECTED' : 'SUSPENDED', rejectedReason: 'Missing details' })
    expect(state.notifications[0].message).toContain('Missing details')
  })
  it.each([{ action: 'feature', featured: true }, { action: 'toggle_active', isActive: false }])('uses explicit desired state for $action', async input => {
    const parsed = trainerAdminActionSchema.parse({ ...input, revision })
    const updated = await applyTrainerAdminAction('trainer', 'admin', parsed)
    expect(updated).toMatchObject(input.action === 'feature' ? { featured: true } : { isActive: false })
    expect(state.audits).toHaveLength(1)
    expect(state.notifications).toHaveLength(0)
  })
  it('does not duplicate notifications for an unchanged approval', async () => {
    state.trainer.approvalStatus = 'APPROVED'
    await approve()
    expect(state.audits).toHaveLength(0)
    expect(state.notifications).toHaveLength(0)
  })
})

describe('trainer decision input and HTTP boundary', () => {
  it.each([null, { action: 'approve' }, { action: 'approve', revision: 'bad' }, { action: 'refund', revision },
    { action: 'reject', revision }, { action: 'reject', revision, reason: '  ' }, { action: 'suspend', revision, reason: 1 },
    { action: 'suspend', revision, reason: 'a'.repeat(2001) }, { action: 'feature', revision },
    { action: 'feature', revision, featured: 'true' }, { action: 'toggle_active', revision },
    { action: 'toggle_active', revision, isActive: 1 }, { action: 'approve', revision, isVerified: true },
  ])('rejects malformed input without touching the database: %j', async input => {
    expect((await request(input)).status).toBe(400)
    expect(mock.transaction).not.toHaveBeenCalled()
  })
  it('rejects invalid JSON', async () => {
    const response = await PATCH(new NextRequest('http://localhost/api/admin/trainers/trainer', { method: 'PATCH', body: '{' }), { params: Promise.resolve({ id: 'trainer' }) })
    expect(response.status).toBe(400)
    expect(mock.transaction).not.toHaveBeenCalled()
  })
  it.each([null, { user: { id: 'parent', role: 'PARENT' } }, { user: { id: 'trainer-user', role: 'TRAINER' } }])('rejects unauthenticated/non-admin sessions', async session => {
    mock.session.mockResolvedValue(session)
    expect((await request({ action: 'approve', revision })).status).toBe(401)
    expect(mock.transaction).not.toHaveBeenCalled()
  })
  it('returns a generic failure without leaking persistence diagnostics', async () => {
    fail = 'notification'
    const response = await request({ action: 'approve', revision })
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('private')
    expect(state.trainer.approvalStatus).toBe('PENDING')
  })
})
