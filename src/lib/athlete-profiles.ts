import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { athleteProfileSchema } from '@/lib/validations'

export const createAthleteSchema = athleteProfileSchema.extend({ requestId: z.string().uuid('Reload the athlete form before saving') }).strict()
export const updateAthleteSchema = athleteProfileSchema.extend({ revision: z.string().datetime() }).strict()
export const deleteAthleteSchema = z.object({ revision: z.string().datetime() }).strict()
export class AthleteError extends Error {
  constructor(message: string, public readonly status: number) { super(message) }
}
export const athleteFields = {
  id: true, firstName: true, lastName: true, dateOfBirth: true, gender: true, skillLevel: true,
  goals: true, notes: true, createdAt: true, updatedAt: true,
  sports: { select: { sport: { select: { id: true, slug: true, name: true, isActive: true } } }, orderBy: { sportId: 'asc' } },
  _count: { select: { bookings: true } },
} satisfies Prisma.AthleteProfileSelect

async function lockParent(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR SHARE`
  const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true, deletedAt: true } })
  if (user?.role !== 'PARENT' || user.deletedAt) throw new AthleteError('Parent access is required', 403)
  // Serialize profile mutations without blocking booking foreign-key checks.
  await tx.$queryRaw`SELECT id FROM parent_profiles WHERE "userId" = ${userId} FOR NO KEY UPDATE`
  const parent = await tx.parentProfile.findUnique({ where: { userId } })
  if (!parent) throw new AthleteError('Parent profile not found', 404)
  return parent
}

async function sportIds(tx: Prisma.TransactionClient, selections: string[]) {
  const matches = await tx.sport.findMany({ where: { OR: [{ id: { in: selections } }, { slug: { in: selections } }] }, select: { id: true, slug: true } })
  const ids = selections.map(value => {
    const options = matches.filter(sport => sport.id === value || sport.slug === value)
    if (options.length !== 1) throw new AthleteError('A selected sport is unavailable or ambiguous. Reload the available sports.', 400)
    return options[0].id
  })
  if (new Set(ids).size !== ids.length) throw new AthleteError('Duplicate sport selections', 400)
  await tx.$queryRaw(Prisma.sql`SELECT id FROM sports WHERE id IN (${Prisma.join([...ids].sort())}) ORDER BY id FOR SHARE`)
  if (await tx.sport.count({ where: { id: { in: ids }, isActive: true } }) !== ids.length) throw new AthleteError('A selected sport is no longer available. Reload the available sports.', 400)
  return ids
}

function details(input: z.infer<typeof athleteProfileSchema>) {
  return { firstName: input.firstName, lastName: input.lastName, dateOfBirth: new Date(`${input.dateOfBirth}T00:00:00.000Z`),
    gender: input.gender || null, skillLevel: input.skillLevel, goals: input.goals, notes: input.notes || null }
}

export async function createAthlete(userId: string, input: z.infer<typeof createAthleteSchema>) {
  const { requestId, ...data } = input
  const payloadHash = createHash('sha256').update(JSON.stringify({ ...details(data), sports: [...data.sports].sort() })).digest('hex')
  return prisma.$transaction(async tx => {
    const parent = await lockParent(tx, userId)
    const previous = await tx.athleteCreateRequest.findUnique({ where: { parentProfileId_requestId: { parentProfileId: parent.id, requestId } } })
    if (previous) {
      if (previous.payloadHash !== payloadHash || !previous.athleteProfileId) throw new AthleteError('This save request was already used or its athlete was deleted. Reload your athletes.', 409)
      const athlete = await tx.athleteProfile.findFirst({ where: { id: previous.athleteProfileId, parentProfileId: parent.id }, select: athleteFields })
      if (!athlete) throw new AthleteError('Saved athlete is unavailable. Reload your athletes.', 409)
      return { athlete, created: false }
    }
    const ids = await sportIds(tx, data.sports)
    const athlete = await tx.athleteProfile.create({ data: { ...details(data), parentProfileId: parent.id, sports: { create: ids.map(sportId => ({ sportId })) } }, select: athleteFields })
    await tx.athleteCreateRequest.create({ data: { parentProfileId: parent.id, requestId, payloadHash, athleteProfileId: athlete.id } })
    return { athlete, created: true }
  })
}

export async function changeAthlete(userId: string, id: string, input: z.infer<typeof updateAthleteSchema> | z.infer<typeof deleteAthleteSchema>, remove = false) {
  return prisma.$transaction(async tx => {
    const parent = await lockParent(tx, userId)
    await tx.$queryRaw`SELECT id FROM athlete_profiles WHERE id = ${id} AND "parentProfileId" = ${parent.id} FOR UPDATE`
    const athlete = await tx.athleteProfile.findFirst({ where: { id, parentProfileId: parent.id }, select: athleteFields })
    if (!athlete) throw new AthleteError('Athlete not found', 404)
    if (athlete.updatedAt.toISOString() !== input.revision) throw new AthleteError('This athlete changed. Reload before saving or deleting.', 409)
    if (remove) {
      if (athlete._count.bookings > 0) throw new AthleteError('Booking history must be retained. Contact support to review removal of this profile.', 409)
      await tx.athleteProfile.delete({ where: { id } })
      return { deleted: true as const }
    }
    const data = updateAthleteSchema.parse(input)
    const ids = await sportIds(tx, data.sports)
    await tx.athleteSport.deleteMany({ where: { athleteProfileId: id } })
    return tx.athleteProfile.update({ where: { id }, data: { ...details(data), updatedAt: new Date(Math.max(Date.now(), athlete.updatedAt.getTime() + 1)),
      sports: { create: ids.map(sportId => ({ sportId })) } }, select: athleteFields })
  })
}
