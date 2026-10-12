import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyBookingAction } from '@/lib/booking-actions'

const mock = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: mock.transaction } }))
let state: any
let fail: string | null
const trainer = { id: 'trainer-user', role: 'TRAINER' }
const parent = { id: 'parent-user', role: 'PARENT' }
const admin = { id: 'admin-user', role: 'ADMIN' }
const act = (action: 'confirm' | 'complete' | 'cancel' | 'no_show', actor = trainer) => applyBookingAction('booking', actor, { action })

beforeEach(() => {
  vi.resetAllMocks()
  fail = null
  state = {
    booking: { id: 'booking', status: 'CONFIRMED', trainerProfileId: 'trainer', totalAmountInCents: 6000,
      timeZone: 'UTC', startsAt: new Date('2020-01-01T09:00:00Z'), endsAt: new Date('2020-01-01T10:00:00Z'),
      trainerProfile: { userId: trainer.id }, parentProfile: { userId: parent.id },
      payment: { id: 'payment', status: 'SUCCEEDED', amountInCents: 6000, refundAmountInCents: 0 } },
    users: [trainer, parent, admin].map(user => ({ ...user, deletedAt: null })),
    stats: { totalSessions: 2, totalBookings: 2 }, notifications: [], audits: [],
  }
  let tail = Promise.resolve()
  mock.query.mockImplementation(async (sql: TemplateStringsArray) => sql.join('').includes('SELECT id, role, "deletedAt"') ? structuredClone(state.users) : [])
  // This serial model verifies transitions/rollback, not real PostgreSQL locks.
  mock.transaction.mockImplementation(async (run) => {
    const previous = tail
    let release!: () => void
    tail = new Promise<void>((resolve) => { release = resolve })
    await previous
    const before = structuredClone(state)
    try {
      return await run({
        $queryRaw: mock.query,
        booking: {
          findUnique: async () => structuredClone(state.booking),
          update: async ({ data }: any) => { Object.assign(state.booking, data); return structuredClone(state.booking) },
        },
        trainerProfile: { update: async ({ data }: any) => {
          if (fail === 'stats') throw new Error('stats failure')
          for (const key of Object.keys(data)) state.stats[key] += data[key].increment
        } },
        user: { findUnique: async ({ where }: any) => state.users.find((user: any) => user.id === where.id) || null,
          findMany: async () => [{ id: admin.id }] },
        notification: { createMany: async ({ data }: any) => {
          if (fail === 'notification') throw new Error('notification failure')
          state.notifications.push(...data)
        } },
        adminAction: { create: async ({ data }: any) => {
          if (fail === 'audit') throw new Error('audit failure')
          state.audits.push(data)
        } },
      })
    } catch (error) { state = before; throw error } finally { release() }
  })
})

describe('booking state transitions', () => {
  for (const actor of [trainer, admin]) for (const action of ['complete', 'no_show'] as const) {
    it(`rejects ${actor.role} ${action} before its saved time without effects`, async () => {
      state.booking.startsAt = new Date(Date.now() + 3600000)
      state.booking.endsAt = new Date(Date.now() + 7200000)
      const before = structuredClone(state)
      await expect(act(action, actor)).rejects.toMatchObject({ status: 409 })
      expect(state).toEqual(before)
    })
    it.each(['zone', 'start', 'end', 'reversed'])(`rejects ${actor.role} ${action} with unknown/invalid %s`, async field => {
      if (field === 'zone') state.booking.timeZone = null
      if (field === 'start') state.booking.startsAt = null
      if (field === 'end') state.booking.endsAt = new Date('invalid')
      if (field === 'reversed') state.booking.endsAt = new Date('2019-01-01T10:00:00Z')
      const before = structuredClone(state)
      await expect(act(action, actor)).rejects.toMatchObject({ status: 409 })
      expect(state).toEqual(before)
    })
  }
  it('does not complete a session that has started but has not ended', async () => {
    state.booking.startsAt = new Date(Date.now() - 1000)
    state.booking.endsAt = new Date(Date.now() + 3600000)
    await expect(act('complete')).rejects.toMatchObject({ status: 409 })
    expect(state.booking.status).toBe('CONFIRMED')
    expect(state.stats.totalSessions).toBe(2)
  })
  it.each(['complete', 'no_show'] as const)('does not let zero-due payment bypass %s timing', async action => {
    state.booking.totalAmountInCents = state.booking.payment.amountInCents = 0
    state.booking.startsAt = new Date(Date.now() + 3600000)
    state.booking.endsAt = new Date(Date.now() + 7200000)
    const before = structuredClone(state)
    await expect(act(action)).rejects.toMatchObject({ status: 409 })
    expect(state).toEqual(before)
  })
  it('allows no-show after the start without claiming session completion', async () => {
    state.booking.startsAt = new Date(Date.now() - 1000)
    state.booking.endsAt = new Date(Date.now() + 3600000)
    await act('no_show')
    expect(state.booking.status).toBe('NO_SHOW')
    expect(state.stats.totalSessions).toBe(2)
    expect(state.notifications[0].type).toBe('NO_SHOW')
  })
  it('preserves idempotent old completion without inventing missing timestamps', async () => {
    state.booking.status = 'COMPLETED'
    state.booking.startsAt = state.booking.endsAt = state.booking.timeZone = null
    await act('complete')
    expect(state.stats.totalSessions).toBe(2)
    expect(state.notifications).toHaveLength(0)
  })
  it.each([parent, trainer, admin])('rejects a stale role for %j before any mutation', async actor => {
    state.users.find((user: any) => user.id === actor.id).role = actor.role === 'PARENT' ? 'TRAINER' : 'PARENT'
    await expect(act('cancel', actor)).rejects.toMatchObject({ status: 403 })
    expect(state.booking.status).toBe('CONFIRMED')
    expect(state.notifications).toHaveLength(0)
    expect(state.audits).toHaveLength(0)
    expect(state.stats.totalSessions).toBe(2)
  })
  it.each([parent, trainer, admin])('rejects a deactivated actor %j even for an idempotent retry', async actor => {
    state.users.find((user: any) => user.id === actor.id).deletedAt = new Date()
    state.booking.status = 'CANCELLED'
    await expect(act('cancel', actor)).rejects.toMatchObject({ status: 403 })
    expect(state.notifications).toHaveLength(0)
  })
  it('rejects a missing actor before changing the booking', async () => {
    state.users = []
    await expect(act('complete')).rejects.toMatchObject({ status: 403 })
    expect(state.booking.status).toBe('CONFIRMED')
    expect(state.stats.totalSessions).toBe(2)
  })
  it('blocks completion while a refund is still pending', async () => {
    state.booking.payment.refundPendingAmountInCents = 6000
    await expect(act('complete')).rejects.toMatchObject({ status: 409 })
    expect(state.booking.status).toBe('CONFIRMED')
    expect(state.notifications).toHaveLength(0)
  })
  it('locks the actor before booking/payment and commits completion with statistics', async () => {
    expect(await act('complete')).toMatchObject({ status: 'COMPLETED' })
    expect(state.stats).toEqual({ totalSessions: 3, totalBookings: 3 })
    expect(state.notifications).toHaveLength(1)
    expect(mock.query.mock.calls[0][0].join('?')).toContain('ORDER BY id FOR SHARE')
    expect(mock.query.mock.calls.slice(1).map((call) => call[0].join('?'))).toEqual([
      'SELECT id FROM bookings WHERE id = ? FOR UPDATE',
      'SELECT id FROM payments WHERE "bookingId" = ? FOR UPDATE',
    ])
  })
  it('retries completion without incrementing statistics or notifying twice', async () => {
    await Promise.all([act('complete'), act('complete')])
    expect(state.stats.totalSessions).toBe(3)
    expect(state.notifications).toHaveLength(1)
  })
  it('serializes competing completion and cancellation decisions', async () => {
    const results = await Promise.allSettled([act('complete'), act('cancel')])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(state.booking.status).toBe('COMPLETED')
  })
  it.each(['stats', 'notification', 'audit'])('rolls back status, statistics and audit on %s failure', async (failure) => {
    fail = failure
    await expect(act('complete', admin)).rejects.toThrow('failure')
    expect(state.booking.status).toBe('CONFIRMED')
    expect(state.stats.totalSessions).toBe(2)
    expect(state.notifications).toHaveLength(0)
    expect(state.audits).toHaveLength(0)
  })
  it.each(['CANCELLED', 'COMPLETED', 'NO_SHOW', 'RESCHEDULED'])('does not allow admin to resurrect %s', async (status) => {
    state.booking.status = status
    await expect(act('confirm', admin)).rejects.toMatchObject({ status: 409 })
    expect(state.booking.status).toBe(status)
  })
  it.each(['PENDING', 'PROCESSING', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'])('will not confirm an unsettled or refunded %s payment', async (status) => {
    state.booking.status = 'PENDING'
    state.booking.payment.status = status
    await expect(act('confirm')).rejects.toMatchObject({ status: 409 })
  })
  it.each(['complete', 'no_show'] as const)('will not %s an unpaid legacy confirmed booking', async (action) => {
    state.booking.payment = null
    await expect(act(action)).rejects.toMatchObject({ status: 409 })
  })
  it('rejects mismatched amounts even with succeeded status', async () => {
    state.booking.payment.amountInCents = 1
    await expect(act('complete')).rejects.toMatchObject({ status: 409 })
  })
  it('confirms a fully settled pending booking', async () => {
    state.booking.status = 'PENDING'
    await act('confirm')
    expect(state.booking.status).toBe('CONFIRMED')
  })
  for (const participant of [parent, trainer]) for (const change of ['role', 'deleted']) {
    it.each(['confirm', 'complete', 'no_show'] as const)(`blocks %s with ${change} ${participant.role} even for an admin`, async action => {
      state.booking.status = action === 'confirm' ? 'PENDING' : 'CONFIRMED'
      const account = state.users.find((user: any) => user.id === participant.id)
      if (change === 'role') account.role = 'ADMIN'
      else account.deletedAt = new Date()
      const before = structuredClone(state)
      await expect(act(action, admin)).rejects.toMatchObject({ status: 409 })
      expect(state).toEqual(before)
    })
  }
  it('allows support cancellation without sending new notices to closed participants', async () => {
    state.users.filter((user: any) => user.role !== 'ADMIN').forEach((user: any) => { user.deletedAt = new Date() })
    await act('cancel', admin)
    expect(state.booking.status).toBe('CANCELLED')
    expect(state.notifications).toHaveLength(1)
    expect(state.notifications[0]).toMatchObject({ userId: admin.id, type: 'PAYMENT_REVIEW_REQUIRED' })
  })
  it('confirms zero-due reservations without claiming money was paid', async () => {
    state.booking.status = 'PENDING'
    state.booking.totalAmountInCents = state.booking.payment.amountInCents = 0
    await act('confirm')
    expect(state.notifications[0].message).toContain('No payment is due')
  })
  it.each([parent, trainer, admin])('cancels for an authorized actor and reports money reconciliation honestly: %j', async (actor) => {
    const before = structuredClone(state.booking.payment)
    await act('cancel', actor)
    expect(state.booking.status).toBe('CANCELLED')
    expect(state.booking.payment).toEqual(before)
    expect(state.notifications.map((n: any) => n.userId)).toEqual([parent.id, trainer.id, admin.id])
    expect(state.notifications[0].message).toContain('no refund has been issued by this action')
    expect(state.notifications[2].type).toBe('PAYMENT_REVIEW_REQUIRED')
  })
  it('flags uncertain checkout cancellation, not only captured payments', async () => {
    state.booking.status = 'PENDING'
    state.booking.payment.status = 'PENDING'
    await act('cancel', parent)
    expect(state.notifications.some((n: any) => n.type === 'PAYMENT_REVIEW_REQUIRED')).toBe(true)
  })
  it('does not create financial review for an unpaid booking with no checkout record', async () => {
    state.booking.status = 'PENDING'
    state.booking.payment = null
    await act('cancel', parent)
    expect(state.notifications).toHaveLength(2)
  })
  it('makes cancellation retries side-effect free', async () => {
    await act('cancel', admin)
    await act('cancel', admin)
    expect(state.notifications).toHaveLength(3)
    expect(state.audits).toHaveLength(1)
    expect(state.audits[0].metadata).toMatchObject({ previousStatus: 'CONFIRMED', status: 'CANCELLED' })
  })
  it.each(['confirm', 'complete', 'no_show'] as const)('does not allow parents to %s', async (action) => {
    await expect(act(action, parent)).rejects.toMatchObject({ status: 403 })
  })
  it.each([{ id: 'other', role: 'PARENT' }, { id: 'other', role: 'TRAINER' }, { id: parent.id, role: 'UNKNOWN' }])('rejects non-owner or invalid-role %j', async (actor) => {
    await expect(act('cancel', actor)).rejects.toMatchObject({ status: 403 })
    expect(state.booking.status).toBe('CONFIRMED')
  })
  it('checks ownership on idempotent retries', async () => {
    state.booking.status = 'CANCELLED'
    await expect(act('cancel', { id: 'other', role: 'PARENT' })).rejects.toMatchObject({ status: 403 })
  })
})
