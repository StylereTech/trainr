import { expect, it, vi } from 'vitest'
import { resolveTrainerSelections } from '@/lib/trainer-catalog'
import { catalogSpecialties } from '@/lib/trainer'

const catalog = [
  { id: 'basketball-id', slug: 'basketball', name: 'Basketball', icon: null, isActive: true, specialties: [{ id: 'basket-defense', slug: 'defense', name: 'Defense' }] },
  { id: 'soccer-id', slug: 'soccer', name: 'Soccer', icon: null, isActive: true, specialties: [{ id: 'soccer-defense', slug: 'defense', name: 'Defense' }] },
  { id: 'football-id', slug: 'football', name: 'Football', icon: null, isActive: true, specialties: [{ id: 'db-QB-ID', slug: 'qb-training', name: 'QB Training' }] },
  { id: 'inactive-id', slug: 'inactive', name: 'Inactive', icon: null, isActive: false, specialties: [] },
]
const tx = () => ({ sport: { findMany: vi.fn(async ({ where }) => catalog.filter((sport) => sport.isActive && where.slug.in.includes(sport.slug))) } }) as any

it('uses database IDs to distinguish equal specialty slugs across sports', async () => {
  expect(await resolveTrainerSelections(tx(), ['basketball', 'soccer'], ['basket-defense', 'soccer-defense'])).toEqual({ sportIds: ['basketball-id', 'soccer-id'], specialtyIds: ['basket-defense', 'soccer-defense'] })
})
it('accepts an unambiguous legacy display name but returns the database ID', async () => {
  expect((await resolveTrainerSelections(tx(), ['football'], ['QB Training'])).specialtyIds).toEqual(['db-QB-ID'])
})
it.each([
  { sports: ['missing'], specialties: ['basket-defense'] },
  { sports: ['inactive'], specialties: ['missing'] },
  { sports: ['basketball', 'basketball'], specialties: ['basket-defense'] },
  { sports: ['basketball'], specialties: ['soccer-defense'] },
  { sports: ['basketball'], specialties: ['missing'] },
  { sports: ['basketball', 'soccer'], specialties: ['defense'] },
  { sports: ['basketball'], specialties: ['basket-defense', 'defense'] },
  { sports: ['football'], specialties: ['qb'] },
])('rejects invalid or ambiguous selections %j', async ({ sports, specialties }) => {
  await expect(resolveTrainerSelections(tx(), sports, specialties)).rejects.toThrow()
})
it('shows database labels and identities only for active selected sports', () => {
  expect(catalogSpecialties(catalog, ['football', 'inactive'])).toEqual([{ id: 'db-QB-ID', slug: 'qb-training', name: 'QB Training', sportName: 'Football' }])
})
