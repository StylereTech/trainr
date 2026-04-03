import { describe, it, expect } from 'vitest'
import {
  signupSchema,
  signinSchema,
  bookingSchema,
  reviewSchema,
  serviceOfferingSchema,
  couponSchema,
  messageSchema,
} from '../src/lib/validations'

describe('Validation Schemas', () => {
  describe('signupSchema', () => {
    it('should validate a correct signup', () => {
      const result = signupSchema.safeParse({
        email: 'test@email.com',
        password: 'Password123!',
        confirmPassword: 'Password123!',
        role: 'PARENT',
        firstName: 'John',
        lastName: 'Doe',
        agreeToTerms: true,
      })
      expect(result.success).toBe(true)
    })

    it('should reject mismatched passwords', () => {
      const result = signupSchema.safeParse({
        email: 'test@email.com',
        password: 'Password123!',
        confirmPassword: 'Different123!',
        role: 'PARENT',
        firstName: 'John',
        lastName: 'Doe',
        agreeToTerms: true,
      })
      expect(result.success).toBe(false)
    })

    it('should reject invalid email', () => {
      const result = signupSchema.safeParse({
        email: 'not-an-email',
        password: 'Password123!',
        confirmPassword: 'Password123!',
        role: 'PARENT',
        firstName: 'John',
        lastName: 'Doe',
        agreeToTerms: true,
      })
      expect(result.success).toBe(false)
    })

    it('should reject short password', () => {
      const result = signupSchema.safeParse({
        email: 'test@email.com',
        password: 'short',
        confirmPassword: 'short',
        role: 'PARENT',
        firstName: 'John',
        lastName: 'Doe',
        agreeToTerms: true,
      })
      expect(result.success).toBe(false)
    })

    it('should require terms agreement', () => {
      const result = signupSchema.safeParse({
        email: 'test@email.com',
        password: 'Password123!',
        confirmPassword: 'Password123!',
        role: 'PARENT',
        firstName: 'John',
        lastName: 'Doe',
        agreeToTerms: false,
      })
      expect(result.success).toBe(false)
    })
  })

  describe('signinSchema', () => {
    it('should validate correct signin', () => {
      const result = signinSchema.safeParse({
        email: 'test@email.com',
        password: 'any-password',
      })
      expect(result.success).toBe(true)
    })

    it('should reject empty password', () => {
      const result = signinSchema.safeParse({
        email: 'test@email.com',
        password: '',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('bookingSchema', () => {
    it('should validate a correct booking', () => {
      const result = bookingSchema.safeParse({
        serviceOfferingId: 'svc-1',
        athleteProfileId: 'athlete-1',
        date: '2026-04-15',
        startTime: '09:00',
      })
      expect(result.success).toBe(true)
    })

    it('should allow optional coupon code', () => {
      const result = bookingSchema.safeParse({
        serviceOfferingId: 'svc-1',
        athleteProfileId: 'athlete-1',
        date: '2026-04-15',
        startTime: '09:00',
        couponCode: 'SUMMER20',
      })
      expect(result.success).toBe(true)
    })

    it('should reject missing required fields', () => {
      const result = bookingSchema.safeParse({
        date: '2026-04-15',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('reviewSchema', () => {
    it('should validate a correct review', () => {
      const result = reviewSchema.safeParse({
        rating: 5,
        knowledgeRating: 4,
        communicationRating: 5,
        punctualityRating: 5,
        comment: 'Great trainer!',
      })
      expect(result.success).toBe(true)
    })

    it('should reject rating below 1', () => {
      const result = reviewSchema.safeParse({
        rating: 0,
        knowledgeRating: 4,
        communicationRating: 4,
        punctualityRating: 4,
      })
      expect(result.success).toBe(false)
    })

    it('should reject rating above 5', () => {
      const result = reviewSchema.safeParse({
        rating: 6,
        knowledgeRating: 4,
        communicationRating: 4,
        punctualityRating: 4,
      })
      expect(result.success).toBe(false)
    })
  })

  describe('serviceOfferingSchema', () => {
    it('should reject price below minimum', () => {
      const result = serviceOfferingSchema.safeParse({
        title: 'Test Session',
        priceInCents: 500, // Below $15 minimum
        durationMinutes: 60,
        type: 'INDIVIDUAL',
      })
      expect(result.success).toBe(false)
    })

    it('should accept valid service offering', () => {
      const result = serviceOfferingSchema.safeParse({
        title: 'Private Football Session',
        priceInCents: 7500,
        durationMinutes: 60,
        type: 'INDIVIDUAL',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('messageSchema', () => {
    it('should reject empty message', () => {
      const result = messageSchema.safeParse({ content: '' })
      expect(result.success).toBe(false)
    })

    it('should reject too long message', () => {
      const result = messageSchema.safeParse({ content: 'x'.repeat(2001) })
      expect(result.success).toBe(false)
    })
  })
})
