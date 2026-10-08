import type { Prisma } from '@prisma/client'
import { slugifySpecialty } from '@/lib/trainer'
import { TrainerEditConflict } from '@/lib/trainer-services'

export const trainerCatalogQuery = {
  orderBy: [{ order: 'asc' as const }, { id: 'asc' as const }],
  select: { id: true, slug: true, name: true, icon: true, isActive: true,
    specialties: { select: { id: true, slug: true, name: true }, orderBy: [{ name: 'asc' as const }, { id: 'asc' as const }] } },
}

export async function resolveTrainerSelections(tx: Prisma.TransactionClient, sportSlugs: string[], selections: string[]) {
  if (new Set(sportSlugs).size !== sportSlugs.length) throw new TrainerEditConflict('Duplicate sports. Reload your sport selections.')
  const sports = await tx.sport.findMany({ ...trainerCatalogQuery, where: { slug: { in: sportSlugs }, isActive: true } })
  if (sports.length !== sportSlugs.length) throw new TrainerEditConflict('A selected sport is unavailable. Reload and update your selections.')
  const options = sports.flatMap((sport) => sport.specialties)
  const specialtyIds = selections.map((value) => {
    const exact = options.find((option) => option.id === value)
    if (exact) return exact.id
    // Legacy slugs are accepted only when unambiguous within the selected sports.
    const matches = options.filter((option) => option.slug === slugifySpecialty(value))
    if (matches.length !== 1) throw new TrainerEditConflict('A specialty is unavailable, ambiguous or outside your selected sports. Reload and choose it again.')
    return matches[0].id
  })
  if (new Set(specialtyIds).size !== specialtyIds.length) throw new TrainerEditConflict('Duplicate specialties. Reload your selections.')
  return { sportIds: sports.map((sport) => sport.id), specialtyIds }
}
