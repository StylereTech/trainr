import { z } from 'zod'
import { bookingSchema } from '@/lib/validations'
import { bookingStates, packageCreditFundingSchema } from '@/lib/dashboard-contract'

// Separate funding contract: cash prices, coupons and legacy package identifiers
// must never silently turn a prepaid reservation into a new cash booking.
export const creditBookingSchema = bookingSchema.omit({ expectedTotalInCents: true, couponCode: true }).extend({
  purchaseId: z.string().trim().min(1).max(128),
}).strict('Unsupported credit booking fields')
export type CreditBookingInput = z.infer<typeof creditBookingSchema>

export const creditBookingResult = z.object({ id: z.string().min(1), status: z.enum(bookingStates), creditFunding: packageCreditFundingSchema }).strict()
export const creditBookingOptions = z.object({
  purchaseId: z.string().min(1), title: z.string(), expiresAt: z.string().datetime().nullable(), hold: z.string().nullable(),
  trainerName: z.string(), timeZone: z.string().nullable(),
  services: z.array(z.object({ id: z.string(), title: z.string(), sportId: z.string(), durationMinutes: z.number().int().positive(),
    availableCredits: z.number().int().nonnegative(), hold: z.string().nullable() }).strict()),
  athletes: z.array(z.object({ id: z.string(), name: z.string(), sportIds: z.array(z.string()) }).strict()),
  slots: z.array(z.object({ dayOfWeek: z.number().int().min(0).max(6).nullable(), specificDate: z.string().datetime().nullable(),
    startTime: z.string(), endTime: z.string(), isRecurring: z.boolean(), isAvailable: z.boolean() }).strict()),
}).strict()
