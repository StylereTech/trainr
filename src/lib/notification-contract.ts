import { z } from 'zod'

const cents = z.number().int().safe()
export const financialReviewSchema = z.object({
  chargeId: z.string(), transferId: z.string(), feeId: z.string().nullable(), destination: z.string(),
  refundedInCents: cents.nonnegative(), transferReversedInCents: cents.nonnegative(), feeRefundedInCents: cents.nonnegative(),
  disputes: z.array(z.object({ id: z.string(), status: z.string(), amountInCents: cents.positive(),
    dueBy: z.number().int().min(0).max(253402300799).nullable(),
    balanceTransactions: z.array(z.object({ id: z.string(), amountInCents: cents, feeInCents: cents, netInCents: cents })),
  })),
})
export const notificationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  view: z.enum(['all', 'unread']).default('all'),
}).strict()
export const notificationActionSchema = z.object({
  ids: z.array(z.string().min(1).max(200)).min(1).max(50).refine(ids => new Set(ids).size === ids.length),
  read: z.boolean(),
}).strict()
export const notificationListSchema = z.object({
  notifications: z.array(z.object({ id: z.string(), type: z.string(), title: z.string(), message: z.string(),
    createdAt: z.string().datetime(), readAt: z.string().datetime().nullable(),
    bookingId: z.string().nullable(), financialReview: financialReviewSchema.nullable(), reviewUnavailable: z.boolean(),
  })),
  unreadCount: z.number().int().nonnegative(),
  pagination: z.object({ page: z.number().int().positive(), limit: z.number().int().positive(), total: z.number().int().nonnegative(), totalPages: z.number().int().nonnegative() }),
})
export type NotificationList = z.infer<typeof notificationListSchema>

export function notificationDetails(data: unknown) {
  const object = z.object({ bookingId: z.string().optional(), financialReview: z.unknown().optional() }).safeParse(data)
  const review = financialReviewSchema.safeParse(object.success ? object.data.financialReview : undefined)
  return { bookingId: object.success ? object.data.bookingId ?? null : null,
    financialReview: review.success ? review.data : null,
    reviewUnavailable: object.success && object.data.financialReview !== undefined && !review.success }
}
