import { z } from 'zod'

export const athleteSportSchema = z.object({ id: z.string(), slug: z.string(), name: z.string(), isActive: z.boolean() })
export const athleteResponseSchema = z.object({
  id: z.string().min(1), firstName: z.string(), lastName: z.string(), dateOfBirth: z.string().datetime(),
  gender: z.enum(['MALE', 'FEMALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY']).nullable(),
  skillLevel: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']), goals: z.array(z.string()), notes: z.string().nullable(),
  updatedAt: z.string().datetime(), sports: z.array(z.object({ sport: athleteSportSchema })), _count: z.object({ bookings: z.number().int().nonnegative() }),
})
export const athleteListSchema = z.object({ athletes: z.array(athleteResponseSchema), catalog: z.array(athleteSportSchema) })
export type AthleteProfile = z.infer<typeof athleteResponseSchema>
