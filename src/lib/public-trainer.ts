import type { Prisma } from '@prisma/client'
import { z } from 'zod'

// Public cards must not inherit newly added private profile or relation fields.
export const publicTrainerCardSelect = {
  id: true, slug: true, firstName: true, lastName: true, headline: true,
  city: true, state: true, avgRating: true, totalReviews: true, totalSessions: true,
  locationType: true, featured: true,
  sports: { select: { sport: { select: { name: true, slug: true, icon: true } } } },
  specialties: { select: { specialty: { select: { name: true, slug: true } } } },
  serviceOfferings: {
    where: { isActive: true }, orderBy: { priceInCents: 'asc' }, take: 1,
    select: { id: true, title: true, priceInCents: true, durationMinutes: true, type: true },
  },
  assets: { where: { type: 'PHOTO' }, orderBy: { order: 'asc' }, take: 1, select: { url: true, type: true, order: true } },
} satisfies Prisma.TrainerProfileSelect

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(12),
})

export function publicPagination(params: URLSearchParams) {
  const result = paginationSchema.safeParse({ page: params.get('page') ?? undefined, limit: params.get('limit') ?? undefined })
  return result.success ? result.data : null
}
