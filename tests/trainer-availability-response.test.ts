import { expect, it, vi } from 'vitest'
import { getPublicTrainerBySlug } from '@/lib/trainer-detail'

const mock = vi.hoisted(() => ({ findFirst: vi.fn().mockResolvedValue(null) }))
vi.mock('@/lib/prisma', () => ({ prisma: { trainerProfile: { findFirst: mock.findFirst } } }))

it('returns blackout flags and one-off dates for the booking availability check', async () => {
  await getPublicTrainerBySlug('trainer')
  const query = mock.findFirst.mock.calls[0][0]
  expect(query.where).toEqual({ slug: 'trainer', approvalStatus: 'APPROVED', isActive: true })
  expect(query.select.availabilitySlots.where).toBeUndefined()
  expect(query.select.availabilitySlots.select).toMatchObject({ isAvailable: true, specificDate: true, isRecurring: true })
})
