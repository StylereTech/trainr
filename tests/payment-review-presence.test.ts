import { Prisma } from '@prisma/client'
import { expect, it, vi } from 'vitest'
import { readPaymentReviewHolds } from '@/lib/payment-review-presence'

it('does not query an empty payment list', async () => {
  const findMany = vi.fn()
  expect(await readPaymentReviewHolds({ payment: { findMany } } as any, [])).toEqual(new Set())
  expect(findMany).not.toHaveBeenCalled()
})
it('queries SQL review presence only for deduplicated booking IDs', async () => {
  const findMany = vi.fn().mockResolvedValue([{ bookingId: 'held' }])
  expect(await readPaymentReviewHolds({ payment: { findMany } } as any, ['held', 'clear', 'held'])).toEqual(new Set(['held']))
  expect(findMany).toHaveBeenCalledWith({ where: { bookingId: { in: ['held', 'clear'] }, financialReview: { not: Prisma.DbNull } }, select: { bookingId: true } })
})
