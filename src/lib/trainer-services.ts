import type { Prisma } from '@prisma/client'
import { z } from 'zod'

export class TrainerEditConflict extends Error {}

export const trainerServiceSchema = z.object({
  id: z.string().min(1).max(128).optional(),
  sportId: z.string().min(1).max(128).optional(),
  title: z.string().trim().min(1).max(150),
  description: z.string().max(2000).optional(),
  durationMinutes: z.number().int().min(1).max(1440).default(60),
  priceInCents: z.number().int().min(1500).max(10000000),
  type: z.enum(['INDIVIDUAL', 'GROUP', 'VIRTUAL']).default('INDIVIDUAL'),
  maxParticipants: z.number().int().min(1).max(50).default(1),
})

// Caller holds the trainer lock, also acquired by reservation creation.
export async function saveTrainerServices(tx: Prisma.TransactionClient, trainerId: string, services: z.infer<typeof trainerServiceSchema>[], allowedSportIds: Set<string>) {
  const existing = await tx.serviceOffering.findMany({
    where: { trainerProfileId: trainerId }, include: { _count: { select: { bookings: true, packageItems: true } } },
  })
  const byId = new Map(existing.map((service) => [service.id, service]))
  const submittedIds = services.flatMap((service) => service.id ? [service.id] : [])
  if (new Set(submittedIds).size !== submittedIds.length) throw new TrainerEditConflict('Duplicate service IDs. Reload the profile before saving.')
  for (const id of submittedIds) {
    if (!byId.get(id)?.isActive) throw new TrainerEditConflict('A service is no longer active or does not belong to this trainer. Reload the profile.')
  }
  const saved = []
  for (const service of services) {
    const previous = service.id ? byId.get(service.id) : undefined
    const sportId = service.sportId ?? previous?.sportId
    if (!sportId || !allowedSportIds.has(sportId)) {
      throw new TrainerEditConflict('Choose an active sport you coach for every service.')
    }
    const data = { sportId, title: service.title, description: service.description || null, durationMinutes: service.durationMinutes,
      priceInCents: service.priceInCents, type: service.type, maxParticipants: service.maxParticipants }
    const changed = previous && Object.entries(data).some(([key, value]) =>
      (key === 'description' ? previous.description || null : previous[key as keyof typeof data]) !== value)
    if (previous && !changed) {
      saved.push(previous)
    } else if (previous && previous._count.bookings === 0 && previous._count.packageItems === 0) {
      saved.push(await tx.serviceOffering.update({ where: { id: previous.id }, data }))
    } else {
      // Keep historical booking/package terms immutable; edits publish a new offering.
      if (previous) await tx.serviceOffering.update({ where: { id: previous.id }, data: { isActive: false } })
      saved.push(await tx.serviceOffering.create({ data: { ...data, trainerProfileId: trainerId } }))
    }
  }
  const retained = new Set(submittedIds)
  for (const service of existing) {
    if (service.isActive && !retained.has(service.id)) {
      await tx.serviceOffering.update({ where: { id: service.id }, data: { isActive: false } })
    }
  }
  return saved.map((service) => ({ id: service.id, sportId: service.sportId, title: service.title, description: service.description || '',
    durationMinutes: service.durationMinutes, priceInCents: service.priceInCents, type: service.type, maxParticipants: service.maxParticipants }))
}
