/**
 * Centralized marketplace fee/split calculation.
 * Single source of truth for all booking fee math.
 */
export function calculateSplit(
  grossAmountCents: number,
  commissionPercent: number = 15
) {
  const platformFee = Math.round(grossAmountCents * (commissionPercent / 100))
  const trainerShare = grossAmountCents - platformFee
  return { grossAmountCents, platformFee, trainerShare, commissionPercent }
}

/**
 * Calculate discount from a coupon.
 */
export function calculateDiscount(
  grossAmountCents: number,
  discountPercent: number | null,
  discountAmountInCents: number | null
): number {
  if (discountPercent) {
    return Math.round(grossAmountCents * discountPercent / 100)
  }
  return discountAmountInCents ?? 0
}
