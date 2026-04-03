import { describe, it, expect } from 'vitest'
import { formatCurrency, slugify, calculatePlatformFee, calculateTrainerPayout, generateStarRating, getInitials, truncate } from '../src/lib/utils'

describe('Utility Functions', () => {
  describe('formatCurrency', () => {
    it('should format cents to dollar string', () => {
      expect(formatCurrency(7500)).toBe('$75.00')
    })

    it('should handle zero', () => {
      expect(formatCurrency(0)).toBe('$0.00')
    })

    it('should handle large amounts', () => {
      expect(formatCurrency(1000000)).toBe('$10,000.00')
    })

    it('should handle odd cents', () => {
      expect(formatCurrency(1234)).toBe('$12.34')
    })
  })

  describe('slugify', () => {
    it('should convert text to URL-safe slug', () => {
      expect(slugify('Marcus Johnson')).toBe('marcus-johnson')
    })

    it('should handle special characters', () => {
      expect(slugify('Track & Field')).toBe('track-and-field')
    })

    it('should handle multiple spaces', () => {
      expect(slugify('Hello   World')).toBe('hello-world')
    })
  })

  describe('calculatePlatformFee', () => {
    it('should calculate 15% default commission', () => {
      expect(calculatePlatformFee(10000)).toBe(1500)
    })

    it('should handle custom commission', () => {
      expect(calculatePlatformFee(10000, 20)).toBe(2000)
    })

    it('should round correctly', () => {
      expect(calculatePlatformFee(3333)).toBe(500) // Math.round(3333 * 0.15) = 500
    })
  })

  describe('calculateTrainerPayout', () => {
    it('should subtract platform fee from total', () => {
      expect(calculateTrainerPayout(10000)).toBe(8500)
    })
  })

  describe('generateStarRating', () => {
    it('should generate full 5 stars', () => {
      const result = generateStarRating(5)
      expect(result).toEqual({ full: 5, half: false, empty: 0 })
    })

    it('should generate 4 full + 1 empty', () => {
      const result = generateStarRating(4)
      expect(result).toEqual({ full: 4, half: false, empty: 1 })
    })

    it('should handle half stars', () => {
      const result = generateStarRating(3.5)
      expect(result).toEqual({ full: 3, half: true, empty: 1 })
    })

    it('should handle 0 rating', () => {
      const result = generateStarRating(0)
      expect(result).toEqual({ full: 0, half: false, empty: 5 })
    })
  })

  describe('getInitials', () => {
    it('should return uppercase initials', () => {
      expect(getInitials('Marcus', 'Johnson')).toBe('MJ')
    })

    it('should handle single character names', () => {
      expect(getInitials('A', 'B')).toBe('AB')
    })
  })

  describe('truncate', () => {
    it('should truncate long strings', () => {
      expect(truncate('This is a very long string', 10)).toBe('This is a …')
    })

    it('should not truncate short strings', () => {
      expect(truncate('Hello', 10)).toBe('Hello')
    })
  })
})
