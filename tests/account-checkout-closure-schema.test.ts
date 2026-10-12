import { describe, expect, it } from 'vitest'
import { closureAction, closureList, closureOutcome, closureQuery, closureResult } from '@/lib/account-checkout-closure-schema'

describe('account checkout closure wire contracts', () => {
  it('bounds queue paging and rejects unknown financial commands', () => {
    expect(closureQuery.parse({})).toEqual({ page: 1 })
    for (const page of [0, -1, 100001, 'bad']) expect(closureQuery.safeParse({ page }).success).toBe(false)
    expect(closureAction.safeParse({ id: 'task', refund: true }).success).toBe(false)
  })
  it('rejects malformed acknowledgements and list rows', () => {
    expect(closureResult.safeParse({ ok: true }).success).toBe(false)
    expect(closureList.safeParse({ rows: [], total: 0 }).success).toBe(false)
    expect(closureResult.safeParse({ id: 'task', status: 'REFUNDED', outcome: null }).success).toBe(false)
  })
  it('never describes closure as a refund receipt', () => {
    expect(closureOutcome('expired_unpaid')).toContain('No refund was issued')
    expect(closureOutcome('payment_review_required')).toContain('financial review')
    expect(closureOutcome(null)).toContain('pending')
  })
})
