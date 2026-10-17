import type { z } from 'zod'
import type { packagePurchaseTermsSchema } from '@/lib/package-purchase-schema'

// A policy day is 24 elapsed hours; local DST changes cannot extend the entitlement.
export function packageValidity(terms: z.infer<typeof packagePurchaseTermsSchema>, paidAt: Date | null) {
  if (terms.version !== 2 || !paidAt || !Number.isFinite(paidAt.getTime())) return null
  return { startsAt: paidAt, expiresAt: new Date(paidAt.getTime() + terms.validForDays * 86400000) }
}
