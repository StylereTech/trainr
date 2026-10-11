import { z } from 'zod'
import { payoutBalanceSchema } from './dashboard-contract'

const timestamp = z.number().int().nonnegative().max(8640000000000)
export const payoutHistorySchema = payoutBalanceSchema.and(z.object({
  schedule: z.object({ interval: z.enum(['manual', 'daily', 'weekly', 'monthly']) }).nullable(),
  payouts: z.array(z.object({
    id: z.string().min(1),
    amountInCents: z.number().int().safe(),
    currency: z.string().regex(/^[a-z]{3}$/),
    status: z.enum(['paid', 'pending', 'in_transit', 'canceled', 'failed']),
    arrivalDate: timestamp,
    createdAt: timestamp,
  })),
}))
