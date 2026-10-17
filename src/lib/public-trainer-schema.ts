import { z } from 'zod'

const count = z.number().int().nonnegative()
const rating = z.number().min(0).max(5)

export const publicTrainerSchema = z.object({
  id: z.string().min(1), slug: z.string().min(1),
  firstName: z.string().min(1), lastName: z.string().min(1),
  headline: z.string().nullable(), bio: z.string().nullable(),
  city: z.string().nullable(), state: z.string().nullable(),
  locationType: z.string(), travelRadius: count, yearsExperience: count,
  timeZone: z.string().nullable().default(null),
  avgRating: rating, totalReviews: count, totalSessions: count,
  sports: z.array(z.object({ sport: z.object({ name: z.string(), icon: z.string().nullable() }) })),
  specialties: z.array(z.object({ specialty: z.object({ name: z.string(), slug: z.string() }) })),
  certifications: z.array(z.object({ name: z.string(), issuingOrg: z.string().nullable(), isVerified: z.boolean() })),
  serviceOfferings: z.array(z.object({
    id: z.string(), title: z.string(), description: z.string().nullable(),
    durationMinutes: count, priceInCents: count, type: z.string(), maxParticipants: count,
  })),
  packages: z.array(z.object({
    id: z.string(), title: z.string(), description: z.string().nullable(),
    totalSessions: count, priceInCents: count, validForDays: count,
    items: z.array(z.object({ serviceOffering: z.object({ title: z.string() }), sessionsCount: count })),
  })),
  availabilitySlots: z.array(z.object({
    dayOfWeek: z.number().int().min(0).max(6).nullable(), startTime: z.string(), endTime: z.string(),
    isRecurring: z.boolean(), isAvailable: z.boolean(),
    specificDate: z.string().nullable().default(null),
  })),
  assets: z.array(z.object({ url: z.string(), type: z.string(), order: z.number().int() })),
  reviews: z.array(z.object({
    id: z.string(), rating, knowledgeRating: rating, communicationRating: rating,
    punctualityRating: rating, comment: z.string().nullable(), createdAt: z.string(),
  })),
  _count: z.object({ reviews: count }),
})

export type PublicTrainer = z.infer<typeof publicTrainerSchema>

export const bookingTrainerSchema = publicTrainerSchema.pick({
  id: true, slug: true, firstName: true, lastName: true, headline: true,
  avgRating: true, totalReviews: true, city: true, state: true, locationType: true,
  sports: true, availabilitySlots: true,
  timeZone: true,
}).extend({ serviceOfferings: z.array(publicTrainerSchema.shape.serviceOfferings.element.omit({ maxParticipants: true })) })
