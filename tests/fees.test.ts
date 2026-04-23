import { describe, expect, it } from 'vitest'
import { calculateDiscount, calculateSplit } from '../src/lib/fees'

describe('fees', () => {
  it('calculates the default 15/85 platform and trainer split', () => {
    expect(calculateSplit(10000)).toEqual({
      grossAmountCents: 10000,
      platformFee: 1500,
      trainerShare: 8500,
      commissionPercent: 15,
    })
  })

  it('keeps split totals balanced for odd cent amounts', () => {
    const result = calculateSplit(9999)
    expect(result.platformFee + result.trainerShare).toBe(9999)
  })

  it('returns a percent discount amount when percent is provided', () => {
    expect(calculateDiscount(10000, 25, null)).toBe(2500)
  })

  it('returns a fixed discount amount when amount is provided', () => {
    expect(calculateDiscount(5000, null, 1500)).toBe(1500)
    expect(calculateDiscount(1000, null, 5000)).toBe(5000)
  })
})
