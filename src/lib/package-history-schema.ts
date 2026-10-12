import { z } from 'zod'

const count = z.number().int().nonnegative().safe()
export const packageHistoryQuery = z.object({
  view: z.enum(['all', 'pending', 'paid', 'refunded', 'review']).default('all'),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
}).strict()
export type PackageHistoryQuery = z.infer<typeof packageHistoryQuery>
export const packageHistoryRecord = z.object({
  id: z.string().min(1), title: z.string(), counterparty: z.string(), createdAt: z.string().datetime(),
  totalSessions: count.min(1), validForDays: count.min(1), creditsGranted: count,
  items: z.array(z.object({ title: z.string(), sessionsCount: count.min(1), durationMinutes: count.min(1) })).min(1),
  amountInCents: count, trainerAllocationInCents: count.nullable(),
  status: z.enum(['PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED']),
  paymentVerified: z.boolean(), reviewRequired: z.boolean(), canRefresh: z.boolean(),
  settlementVerifiedAt: z.string().datetime().nullable(),
  refundAmountInCents: count, refundPendingAmountInCents: count, refundFailedCount: count,
  refundsVerifiedAt: z.string().datetime().nullable(),
}).strict()
export const packageHistoryResponse = z.object({
  purchases: z.array(packageHistoryRecord),
  pagination: z.object({ page: count.min(1), limit: count.min(1), total: count, totalPages: count }),
}).strict()
export const packageRefreshRequest = z.object({ purchaseId: z.string().trim().min(1).max(128) }).strict()
export const packageRefreshResponse = z.object({ refreshed: z.literal(true), purchaseId: z.string().min(1) }).strict()
export type PackageHistoryRecord = z.infer<typeof packageHistoryRecord>

export function packagePaymentLabel(purchase: PackageHistoryRecord) {
  if (['REFUNDED', 'PARTIALLY_REFUNDED'].includes(purchase.status) && (!purchase.paymentVerified || !purchase.refundsVerifiedAt)) return 'Refund verification needed'
  if (purchase.status === 'SUCCEEDED' && !purchase.paymentVerified) return 'Payment verification needed'
  return { PENDING: 'Payment not recorded', PROCESSING: 'Payment processing', SUCCEEDED: 'Payment verified', FAILED: 'Payment failed',
    REFUNDED: 'Refunded', PARTIALLY_REFUNDED: 'Partially refunded' }[purchase.status]
}
