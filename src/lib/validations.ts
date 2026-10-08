import { z } from 'zod'

export const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
  role: z.enum(['PARENT', 'TRAINER']),
  firstName: z.string().min(1, 'First name required').max(50),
  lastName: z.string().min(1, 'Last name required').max(50),
  phone: z.string().optional(),
  agreeToTerms: z.literal(true, { errorMap: () => ({ message: 'You must agree to the terms' }) }),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

export const signinSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password required'),
})

export const trainerProfileSchema = z.object({
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  headline: z.string().max(100).optional(),
  bio: z.string().max(2000).optional(),
  phone: z.string().optional(),
  yearsExperience: z.number().min(0).max(50),
  locationType: z.enum(['IN_PERSON', 'VIRTUAL', 'BOTH']),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  travelRadius: z.number().min(5).max(100).default(25),
  sports: z.array(z.string()).min(1, 'Select at least one sport'),
  specialties: z.array(z.string()).min(1, 'Select at least one specialty'),
})

export const parentProfileSchema = z.object({
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
})

export const athleteProfileSchema = z.object({
  firstName: z.string().trim().min(1, 'First name required').max(50),
  lastName: z.string().trim().min(1, 'Last name required').max(50),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be YYYY-MM-DD').refine(value => {
    const date = new Date(`${value}T00:00:00.000Z`)
    return Number(value.slice(0, 4)) > 0 && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value <= new Date().toISOString().slice(0, 10)
  }, 'Date of birth must be a valid date that is not in the future'),
  gender: z.enum(['MALE', 'FEMALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY']).optional(),
  skillLevel: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']).default('BEGINNER'),
  sports: z.array(z.string().trim().min(1).max(128)).min(1, 'Select at least one sport').max(20).refine(values => new Set(values).size === values.length, 'Duplicate sport selections'),
  goals: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  notes: z.string().trim().max(2000).default(''),
})

export const serviceOfferingSchema = z.object({
  sportId: z.string().optional(),
  title: z.string().min(1, 'Title required').max(100),
  description: z.string().max(500).optional(),
  durationMinutes: z.number().min(15).max(480).default(60),
  priceInCents: z.number().min(1500, 'Minimum price is $15'),
  type: z.enum(['INDIVIDUAL', 'GROUP', 'VIRTUAL']).default('INDIVIDUAL'),
  maxParticipants: z.number().min(1).max(50).default(1),
})

export const packageSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  totalSessions: z.number().min(2).max(50),
  priceInCents: z.number().min(2000, 'Minimum package price is $20'),
  validForDays: z.number().min(7).max(365).default(90),
  serviceIds: z.array(z.string()).min(1),
})

export const bookingSchema = z.object({
  requestId: z.string().uuid('Reload the booking form before reserving'),
  serviceOfferingId: z.string().trim().min(1).max(128),
  athleteProfileId: z.string().trim().min(1).max(128),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD').refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`)
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  }, 'date must be a valid calendar date'),
  startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'startTime must be HH:MM'),
  notes: z.string().max(2000).optional(),
  couponCode: z.string().trim().max(32).optional(),
})

export const reviewSchema = z.object({
  rating: z.number().min(1).max(5),
  knowledgeRating: z.number().min(1).max(5),
  communicationRating: z.number().min(1).max(5),
  punctualityRating: z.number().min(1).max(5),
  comment: z.string().max(500).optional(),
})

export const couponSchema = z.object({
  code: z.string().min(3).max(32),
  discountPercent: z.number().min(1).max(100).optional(),
  discountAmountInCents: z.number().min(1).optional(),
  maxUses: z.number().min(1).default(100),
  expiresAt: z.string().datetime().optional(),
}).refine((data) => data.discountPercent || data.discountAmountInCents, {
  message: 'A coupon needs either a percent or fixed discount',
})

export const messageSchema = z.object({
  content: z.string().min(1, 'Message cannot be empty').max(2000),
})

export type SignupInput = z.infer<typeof signupSchema>
export type SigninInput = z.infer<typeof signinSchema>
export type TrainerProfileInput = z.infer<typeof trainerProfileSchema>
export type ParentProfileInput = z.infer<typeof parentProfileSchema>
export type AthleteProfileInput = z.infer<typeof athleteProfileSchema>
export type ServiceOfferingInput = z.infer<typeof serviceOfferingSchema>
export type PackageInput = z.infer<typeof packageSchema>
export type BookingInput = z.infer<typeof bookingSchema>
export type ReviewInput = z.infer<typeof reviewSchema>
export type MessageInput = z.infer<typeof messageSchema>
