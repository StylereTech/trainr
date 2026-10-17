import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { packageCommandSchema, packageSaveSchema, type PackageSave } from '@/lib/trainer-package-schema'

export class PackageEditError extends Error {
  constructor(message: string, public status = 409) { super(message) }
}
const packageInclude = { items: { orderBy: { id: 'asc' as const }, include: { serviceOffering: { include: { sport: true } } } },
  _count: { select: { bookings: true } } } satisfies Prisma.PackageInclude
type StoredPackage = Prisma.PackageGetPayload<{ include: typeof packageInclude }>
async function owner(tx: Prisma.TransactionClient, userId: string) {
  const trainer = await tx.trainerProfile.findUnique({ where: { userId }, include: { user: { select: { role: true, deletedAt: true } }, sports: true } })
  if (!trainer || trainer.user.role !== 'TRAINER' || trainer.user.deletedAt) throw new PackageEditError('Active trainer account required', 403)
  return trainer
}
type Owner = Awaited<ReturnType<typeof owner>>
const available = (service: StoredPackage['items'][number]['serviceOffering'], trainer: Owner) =>
  service.trainerProfileId === trainer.id && service.isActive && !!service.sport?.isActive && trainer.sports.some(sport => sport.sportId === service.sportId)
function record(value: StoredPackage, trainer: Owner) {
  return { id: value.id, revision: value.updatedAt.toISOString(), title: value.title, description: value.description || '',
    totalSessions: value.totalSessions, priceInCents: value.priceInCents, validForDays: value.validForDays,
    isActive: value.isActive, termsLocked: value._count.bookings > 0,
    items: value.items.map(item => ({ serviceOfferingId: item.serviceOfferingId, sessionsCount: item.sessionsCount,
      title: item.serviceOffering.title, available: available(item.serviceOffering, trainer) })) }
}
export async function readTrainerPackages(userId: string, page: number) {
  return prisma.$transaction(async tx => {
    const trainer = await owner(tx, userId)
    const where = { trainerProfileId: trainer.id }
    const total = await tx.package.count({ where }), totalPages = Math.max(1, Math.ceil(total / 20))
    const currentPage = Math.min(page, totalPages)
    const packages = await tx.package.findMany({ where, include: packageInclude, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (currentPage - 1) * 20, take: 20 })
    const services = await tx.serviceOffering.findMany({ where: { trainerProfileId: trainer.id, isActive: true,
      sportId: { in: trainer.sports.map(sport => sport.sportId) }, sport: { isActive: true } },
      orderBy: [{ title: 'asc' }, { id: 'asc' }], select: { id: true, title: true, durationMinutes: true } })
    return { packages: packages.map(value => record(value, trainer)), services, page: currentPage, total, totalPages }
  }, { isolationLevel: 'RepeatableRead' })
}
function sameTerms(value: StoredPackage, input: PackageSave) {
  return value.title === input.title && (value.description || '') === input.description && value.priceInCents === input.priceInCents &&
    value.validForDays === input.validForDays && value.totalSessions === input.items.reduce((sum, item) => sum + item.sessionsCount, 0) &&
    value.items.length === input.items.length && value.items.every(item => input.items.some(next => next.serviceOfferingId === item.serviceOfferingId && next.sessionsCount === item.sessionsCount))
}
export async function saveTrainerPackage(userId: string, raw: unknown) {
  const input = packageCommandSchema.parse(raw)
  return prisma.$transaction(async tx => {
    // Match account closure's lock order, then serialize with service/profile edits.
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR SHARE`
    const initial = await owner(tx, userId)
    await tx.$queryRaw`SELECT id FROM trainer_profiles WHERE id = ${initial.id} FOR UPDATE`
    const trainer = await owner(tx, userId)
    const previous = await tx.package.findUnique({ where: { id: input.id }, include: packageInclude })
    if (previous && previous.trainerProfileId !== trainer.id) throw new PackageEditError('Package not found', 404)
    if (!previous && (input.action !== 'save' || input.revision !== null)) throw new PackageEditError('Package not found', 404)
    if (previous && input.revision === null) {
      if (input.action === 'save' && !previous.isActive && sameTerms(previous, input)) return record(previous, trainer)
      throw new PackageEditError('This creation request already has a saved package. Reload the list.')
    }
    if (previous && previous.updatedAt.toISOString() !== input.revision) throw new PackageEditError('Package changed. Reload and review it before saving.')
    if (!previous && !z.string().uuid().safeParse(input.id).success) throw new PackageEditError('A new package requires a unique creation ID', 400)
    const updatedAt = new Date(Math.max(Date.now(), (previous?.updatedAt.getTime() || 0) + 1))
    if (input.action === 'setActive') {
      const terms = packageSaveSchema.safeParse({ action: 'save', id: input.id, revision: input.revision,
        title: previous!.title, description: previous!.description || '', priceInCents: previous!.priceInCents,
        validForDays: previous!.validForDays, items: previous!.items.map(({ serviceOfferingId, sessionsCount }) => ({ serviceOfferingId, sessionsCount })) })
      if (input.isActive && (!terms.success || previous!.totalSessions !== previous!.items.reduce((sum, item) => sum + item.sessionsCount, 0))) {
        throw new PackageEditError('Correct the package terms before activating this package.')
      }
      if (input.isActive && (!previous!.items.length || previous!.items.some(item => !available(item.serviceOffering, trainer)))) {
        throw new PackageEditError('Replace unavailable services before activating this package.')
      }
      return record(await tx.package.update({ where: { id: input.id }, data: { isActive: input.isActive, updatedAt }, include: packageInclude }), trainer)
    }
    if (previous?._count.bookings && !sameTerms(previous, input)) throw new PackageEditError('Booked package terms are locked. Duplicate the package to offer different terms.')
    const services = await tx.serviceOffering.findMany({ where: { id: { in: input.items.map(item => item.serviceOfferingId) } }, include: { sport: true } })
    if (services.length !== input.items.length || services.some(service => !available(service, trainer))) throw new PackageEditError('Choose active services and sports from your own profile.')
    if (previous && sameTerms(previous, input)) return record(previous, trainer)
    const data = { title: input.title, description: input.description || null, priceInCents: input.priceInCents, validForDays: input.validForDays,
      totalSessions: input.items.reduce((sum, item) => sum + item.sessionsCount, 0), updatedAt }
    if (previous) await tx.packageItem.deleteMany({ where: { packageId: previous.id } })
    const items = { create: input.items.map(item => ({ serviceOfferingId: item.serviceOfferingId, sessionsCount: item.sessionsCount })) }
    const saved = previous ? await tx.package.update({ where: { id: previous.id }, data: { ...data, items }, include: packageInclude }) :
      await tx.package.create({ data: { ...data, id: input.id, trainerProfileId: trainer.id, isActive: false, items }, include: packageInclude })
    return record(saved, trainer)
  })
}
