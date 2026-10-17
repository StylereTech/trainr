import type { Prisma } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { restoreLockedCancelledPackageCredit } from '@/lib/package-credit-ledger'

describe('restoration inside an already locked booking action', () => {
  const now = new Date('2026-10-13T12:00:00Z')
  const booking = { id: 'booking', status: 'CANCELLED', startsAt: new Date('2026-10-16T12:00:00Z'), parentUserId: 'parent', trainerUserId: 'trainer' }
  function context(restoredAt: Date | null = null) {
    const saved = { bookingId: booking.id, restoredAt }
    const calls = { findUniqueOrThrow: vi.fn().mockResolvedValue(saved), update: vi.fn().mockResolvedValue({ ...saved, restoredAt: now }),
      $queryRaw: vi.fn().mockResolvedValue([{ now }]) }
    const tx = { packageCreditRedemption: calls, $queryRaw: calls.$queryRaw } as unknown as Prisma.TransactionClient
    return { tx, calls, saved }
  }
  it.each([{ id: 'other', role: 'PARENT' }, { id: 'parent', role: 'TRAINER' }, { id: 'admin', role: 'ADMIN' }])('rejects a mismatched owner %j before reading the ledger', async actor => {
    const { tx, calls } = context()
    await expect(restoreLockedCancelledPackageCredit(tx, actor, booking)).rejects.toMatchObject({ status: 403 })
    expect(calls.findUniqueOrThrow).not.toHaveBeenCalled()
    expect(calls.$queryRaw).not.toHaveBeenCalled()
  })
  it('requires the cancellation update before restoration', async () => {
    const { tx, calls } = context()
    await expect(restoreLockedCancelledPackageCredit(tx, { id: 'parent', role: 'PARENT' }, { ...booking, status: 'CONFIRMED' })).rejects.toThrow('cancelled booking')
    expect(calls.findUniqueOrThrow).not.toHaveBeenCalled()
  })
  it('preserves an existing restoration without reading the clock or rewriting history', async () => {
    const { tx, calls, saved } = context(now)
    expect(await restoreLockedCancelledPackageCredit(tx, { id: 'parent', role: 'PARENT' }, booking)).toEqual(saved)
    expect(calls.$queryRaw).not.toHaveBeenCalled()
    expect(calls.update).not.toHaveBeenCalled()
  })
  it('keeps a late parent cancellation consumed', async () => {
    const { tx, calls, saved } = context()
    expect(await restoreLockedCancelledPackageCredit(tx, { id: 'parent', role: 'PARENT' }, { ...booking, startsAt: new Date(now.getTime() + 3600000) })).toEqual(saved)
    expect(calls.update).not.toHaveBeenCalled()
    expect(calls.$queryRaw).toHaveBeenCalledTimes(1)
  })
  it.each([{ id: 'parent', role: 'PARENT', reason: 'EARLY_PARENT_CANCELLATION' },
    { id: 'trainer', role: 'TRAINER', reason: 'TRAINER_CANCELLATION' }])('restores once for the owning $role without reacquiring locks', async ({ reason, ...actor }) => {
    const { tx, calls } = context()
    await restoreLockedCancelledPackageCredit(tx, actor, booking)
    expect(calls.findUniqueOrThrow).toHaveBeenCalledTimes(1)
    expect(calls.$queryRaw).toHaveBeenCalledTimes(1)
    expect(calls.update).toHaveBeenCalledWith({ where: { bookingId: booking.id }, data: { restoredAt: now, restoredByUserId: actor.id, restorationReason: reason } })
  })
})
