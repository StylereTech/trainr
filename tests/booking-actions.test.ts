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
      trainerProfile: { userId: trainer.id }, parentProfile: { userId: parent.id },
      payment: { id: 'payment', status: 'SUCCEEDED', amountInCents: 6000, refundAmountInCents: 0 } },
    stats: { totalSessions: 2, totalBookings: 2 }, notifications: [], audits: [],
  }
  let tail = Promise.resolve()
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
        user: { findMany: async () => [{ id: admin.id }] },
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
  it('blocks completion while a refund is still pending', async () => {
    state.booking.payment.refundPendingAmountInCents = 6000
    await expect(act('complete')).rejects.toMatchObject({ status: 409 })
    expect(state.booking.status).toBe('CONFIRMED')
    expect(state.notifications).toHaveLength(0)
  })
  it('locks booking before payment and commits completion with statistics', async () => {
    expect(await act('complete')).toMatchObject({ status: 'COMPLETED' })
    expect(state.stats).toEqual({ totalSessions: 3, totalBookings: 3 })
    expect(state.notifications).toHaveLength(1)
    expect(mock.query.mock.calls.map((call) => call[0].join('?'))).toEqual([
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
