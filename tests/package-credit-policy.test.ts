import { describe, expect, it } from 'vitest'
import { creditRestorationReason } from '@/lib/package-credit-policy'

describe('approved session-credit cancellation policy', () => {
  const cancelledAt = new Date('2026-10-13T12:00:00.000Z')
  it.each([0, 1, 86400000])('restores parent cancellations at least 24h early (+%s ms)', extra => {
    expect(creditRestorationReason('PARENT', new Date(cancelledAt.getTime() + 86400000 + extra), cancelledAt)).toBe('EARLY_PARENT_CANCELLATION')
  })
  it.each([1, 1000, 86400000, 172800000])('consumes a parent cancellation %s ms after the cutoff', late => {
    expect(creditRestorationReason('PARENT', new Date(cancelledAt.getTime() + 86400000 - late), cancelledAt)).toBeNull()
  })
  it.each([null, new Date('invalid'), cancelledAt, new Date(0)])('restores trainer cancellations independently of session time: %s', startsAt => {
    expect(creditRestorationReason('TRAINER', startsAt, cancelledAt)).toBe('TRAINER_CANCELLATION')
  })
  it.each(['ADMIN', '', 'parent', 'OTHER'])('does not invent a restoration policy for %s', role => {
    expect(creditRestorationReason(role, new Date(cancelledAt.getTime() + 172800000), cancelledAt)).toBeNull()
  })
  it.each([null, new Date('invalid')])('does not infer an unknown parent cancellation window: %s', startsAt => {
    expect(creditRestorationReason('PARENT', startsAt, cancelledAt)).toBeNull()
  })
  it('rejects an invalid cancellation time for either role', () => {
    for (const role of ['PARENT', 'TRAINER']) expect(creditRestorationReason(role, cancelledAt, new Date('invalid'))).toBeNull()
  })
})
