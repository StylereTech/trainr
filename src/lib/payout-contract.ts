import { z } from 'zod'
import { payoutBalanceSchema } from './dashboard-contract'

const timestamp = z.number().int().nonnegative().max(8640000000000)
const payoutId = z.string().regex(/^po_[A-Za-z0-9_]+$/).max(255)
export const payoutHistoryQuery = z.object({ startingAfter: payoutId.optional() }).strict()
export const payoutHistorySchema = payoutBalanceSchema.and(z.object({
  hasMore: z.boolean(),
  nextCursor: payoutId.nullable(),
  schedule: z.object({ interval: z.enum(['manual', 'daily', 'weekly', 'monthly']) }).nullable(),
  payouts: z.array(z.object({
    id: payoutId,
    amountInCents: z.number().int().safe(),
    currency: z.string().regex(/^[a-z]{3}$/),
    status: z.enum(['paid', 'pending', 'in_transit', 'canceled', 'failed']),
    arrivalDate: timestamp,
    createdAt: timestamp,
  })).max(20),
})).superRefine((value, context) => {
  const last = value.payouts.at(-1)?.id
  if ((value.hasMore ? !last || value.nextCursor !== last : value.nextCursor !== null) ||
      new Set(value.payouts.map(payout => payout.id)).size !== value.payouts.length ||
      (!value.connected && (value.payouts.length > 0 || value.hasMore))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Payout pagination could not be verified' })
  }
})
