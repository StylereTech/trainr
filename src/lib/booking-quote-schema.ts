import { z } from 'zod'
import { isSupportedBookingTotal } from '@/lib/fees'

export const bookingQuoteInput = z.object({
  serviceOfferingId: z.string().trim().min(1).max(128),
  couponCode: z.string().trim().max(32).optional(),
}).strict()

export const bookingQuoteSchema = z.object({
  serviceOfferingId: z.string().min(1),
  couponCode: z.string(),
  currency: z.literal('usd'),
  subtotalInCents: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  discountInCents: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  totalAmountInCents: z.number().refine(isSupportedBookingTotal),
}).refine(value => value.subtotalInCents - value.discountInCents === value.totalAmountInCents, 'Invalid price calculation')
export type BookingQuote = z.infer<typeof bookingQuoteSchema>
