import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'

type SettlementReview = {
  requiresReview: boolean
  review?: { key: string; details: Prisma.InputJsonObject } | null
}
type RefundTotals = { succeeded: number; pending: number; failed: number }

// Keep refresh and paid-event review identities identical for the same observations.
export function paymentFinancialReview(bookingId: string, settlement: SettlementReview, refunds: RefundTotals, participantReview: string[]) {
  const refundActivity = refunds.succeeded > 0 || refunds.pending > 0 || refunds.failed > 0
  const details = participantReview.length || refundActivity ? { ...settlement.review?.details, participantReview,
    paymentRefunds: { refundedInCents: refunds.succeeded, pendingInCents: refunds.pending, failedCount: refunds.failed } } : null
  const review = details ? { key: createHash('sha256').update(JSON.stringify({ bookingId, ...details })).digest('hex'), details } : settlement.review
  return { review, refundActivity, requiresReview: settlement.requiresReview || participantReview.length > 0 || refundActivity }
}
