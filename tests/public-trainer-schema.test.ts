import { describe, expect, it } from 'vitest'
import { bookingTrainerSchema, publicTrainerSchema } from '@/lib/public-trainer-schema'

const profile = {
  id: 'coach', slug: 'coach', firstName: 'Test', lastName: 'Coach', headline: null, bio: null,
  city: null, state: null, locationType: 'VIRTUAL', travelRadius: 0, yearsExperience: 0,
  avgRating: 0, totalReviews: 0, totalSessions: 0, sports: [], specialties: [], certifications: [],
  serviceOfferings: [], packages: [], availabilitySlots: [], assets: [], reviews: [], _count: { reviews: 0 },
}

describe('public trainer response boundary', () => {
  it('accepts an empty, valid profile without inventing services or reviews', () => {
    expect(publicTrainerSchema.parse(profile)).toEqual(profile)
  })
  it.each([
    { error: 'Trainer not found' },
    { ...profile, firstName: null },
    { ...profile, sports: [{ sport: null }] },
    { ...profile, serviceOfferings: null },
    { ...profile, packages: [{ items: [null] }] },
    { ...profile, _count: null },
    { ...profile, avgRating: '4.5' },
    { ...profile, reviews: [null] },
    { ...profile, availabilitySlots: [{ dayOfWeek: 8 }] },
  ])('rejects malformed render data %#', input => {
    expect(publicTrainerSchema.safeParse(input).success).toBe(false)
  })
  it('preserves one-time booking dates', () => {
    const slot = { dayOfWeek: null, specificDate: '2026-10-20T00:00:00.000Z', startTime: '09:00', endTime: '10:00', isRecurring: false, isAvailable: true }
    expect(bookingTrainerSchema.parse({ ...profile, availabilitySlots: [slot] }).availabilitySlots).toEqual([slot])
  })
  it('supports the narrower booking response and omits unrelated fields', () => {
    const booking = bookingTrainerSchema.parse(profile)
    expect(publicTrainerSchema.safeParse(booking).success).toBe(false)
    expect(bookingTrainerSchema.parse(booking)).toEqual(booking)
    expect(bookingTrainerSchema.parse({ ...booking, privateField: 'not for rendering' })).not.toHaveProperty('privateField')
  })
})
