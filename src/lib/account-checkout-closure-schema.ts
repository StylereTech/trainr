import { z } from 'zod'

export const closureQuery = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1) }).strict()
export const closureAction = z.object({ id: z.string().min(1).max(160) }).strict()
export const closureResult = z.object({ id: z.string(), status: z.enum(['PENDING', 'REVIEW', 'CLOSED']), outcome: z.string().nullable() })
export const closureList = z.object({ rows: z.array(closureResult.extend({ kind: z.enum(['BOOKING', 'PACKAGE']), targetId: z.string(), userId: z.string(),
  checkedAt: z.string().datetime().nullable(), createdAt: z.string().datetime() })),
  page: z.number().int().positive(), total: z.number().int().nonnegative(), totalPages: z.number().int().nonnegative() })

export function closureLabel(status: string) {
  return status === 'CLOSED' ? 'Expired unpaid' : status === 'REVIEW' ? 'Review required' : 'Queued'
}
export function closureOutcome(outcome: string | null) {
  if (outcome === 'expired_unpaid') return 'Checkout expired without a payable intent. No refund was issued.'
  if (outcome === 'missing_session_identity') return 'Checkout identity is unresolved. Reconcile the original request before retrying.'
  if (outcome === 'payment_review_required') return 'Payment or checkout still requires financial review. No refund was issued.'
  return outcome ? 'Provider or identity verification failed. Review the original records before retrying.' : 'Account access is revoked. Checkout closure is pending.'
}
