import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PrismaClient, type User } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { applyUserAdminAction } from '@/lib/user-admin-actions'
import { applyTrainerAdminAction } from '@/lib/trainer-admin-actions'
import { resolveSessionUser } from '@/lib/session-user'
import { authOptions } from '@/lib/auth'
import { hash } from 'bcryptjs'

vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => ({ allowed: true }), getClientIp: () => 'synthetic' }))

const independent = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL })
const ids: string[] = []
let actor: User
let other: User
let parent: User
async function create(role: 'PARENT' | 'ADMIN' | 'TRAINER') {
  const user = await prisma.user.create({ data: { email: `admin-audit-${randomUUID()}@example.test`, role, passwordHash: 'not-a-login',
    ...(role === 'PARENT' ? { parentProfile: { create: {} } } : {}),
    ...(role === 'TRAINER' ? { trainerProfile: { create: { firstName: 'Synthetic', lastName: 'Trainer', slug: randomUUID(), approvalStatus: 'APPROVED' } } } : {}),
  } })
  ids.push(user.id)
  return user
}
const change = (user: User, role: 'PARENT' | 'TRAINER' | 'ADMIN') => ({ action: 'change_role' as const, userId: user.id, revision: user.updatedAt.toISOString(), role })
const deactivate = (user: User) => ({ action: 'delete' as const, userId: user.id, revision: user.updatedAt.toISOString(), reason: 'Synthetic audit closure' })
beforeAll(async () => {
  expect(await prisma.$queryRaw`SELECT purpose FROM trainr_test_guard`).toEqual([{ purpose: 'disposable integration database' }])
})
beforeEach(async () => { actor = await create('ADMIN'); other = await create('ADMIN'); parent = await create('PARENT') })
afterEach(async () => {
  await prisma.booking.deleteMany({ where: { parentProfile: { userId: { in: ids } } } })
  await prisma.adminAction.deleteMany({ where: { adminUserId: { in: ids } } })
  await prisma.user.deleteMany({ where: { id: { in: ids } } })
  ids.length = 0
})
afterAll(async () => { await prisma.$disconnect(); await independent.$disconnect() })

describe('real PostgreSQL administrator account integrity', () => {
  it('commits parent profile, role, version and audit together without exposing credentials', async () => {
    const updated = await applyUserAdminAction(actor.id, change(other, 'PARENT'))
    expect(updated).toMatchObject({ id: other.id, role: 'PARENT' })
    expect(updated).not.toHaveProperty('passwordHash')
    expect(updated).not.toHaveProperty('sessionVersion')
    const stored = await independent.user.findUniqueOrThrow({ where: { id: other.id }, include: { parentProfile: true } })
    expect(stored).toMatchObject({ role: 'PARENT', sessionVersion: 1 })
    expect(stored.parentProfile).not.toBeNull()
    expect(await independent.adminAction.count({ where: { targetId: other.id } })).toBe(1)
  })
  it('requires actual trainer names and creates a pending unconnected profile', async () => {
    await expect(applyUserAdminAction(actor.id, change(parent, 'TRAINER'))).rejects.toMatchObject({ status: 400 })
    await applyUserAdminAction(actor.id, { ...change(parent, 'TRAINER'), firstName: 'Synthetic', lastName: 'Coach' })
    const stored = await independent.trainerProfile.findUniqueOrThrow({ where: { userId: parent.id } })
    expect(stored).toMatchObject({ firstName: 'Synthetic', lastName: 'Coach', approvalStatus: 'PENDING', stripeAccountId: null, stripeOnboardingComplete: false })
  })
  it('rejects stale revisions and does not duplicate same-role writes', async () => {
    await applyUserAdminAction(actor.id, change(parent, 'PARENT'))
    expect(await independent.adminAction.count({ where: { targetId: parent.id } })).toBe(0)
    await applyUserAdminAction(actor.id, change(parent, 'ADMIN'))
    await expect(applyUserAdminAction(actor.id, change(parent, 'TRAINER'))).rejects.toMatchObject({ status: 409 })
    expect((await independent.user.findUniqueOrThrow({ where: { id: parent.id } })).sessionVersion).toBe(1)
  })
  it('allows only one concurrent change from the same review', async () => {
    const results = await Promise.allSettled([applyUserAdminAction(actor.id, change(parent, 'ADMIN')), applyUserAdminAction(other.id, deactivate(parent))])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { status: 409 } })
    expect(await independent.adminAction.count({ where: { targetId: parent.id } })).toBe(1)
  })
  it('preserves one administrator when both try to demote themselves concurrently', async () => {
    const results = await Promise.allSettled([applyUserAdminAction(actor.id, change(actor, 'PARENT')), applyUserAdminAction(other.id, change(other, 'PARENT'))])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { status: 409 } })
    expect(await independent.user.count({ where: { role: 'ADMIN', deletedAt: null } })).toBe(1)
  })
  it('preserves one administrator when two administrators try to deactivate each other', async () => {
    const results = await Promise.allSettled([applyUserAdminAction(actor.id, deactivate(other)), applyUserAdminAction(other.id, deactivate(actor))])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { status: 403 } })
    expect(await independent.user.count({ where: { role: 'ADMIN', deletedAt: null } })).toBe(1)
  })
  it('denies last-admin removal and admin self-deactivation', async () => {
    await expect(applyUserAdminAction(actor.id, deactivate(actor))).rejects.toMatchObject({ status: 403 })
    await prisma.user.delete({ where: { id: other.id } })
    await expect(applyUserAdminAction(actor.id, change(actor, 'PARENT'))).rejects.toMatchObject({ status: 409 })
    await expect(applyUserAdminAction(actor.id, deactivate(actor))).rejects.toMatchObject({ status: 409 })
  })
  it('denies a deactivated administrator inside subsequent trainer-decision transactions', async () => {
    await applyUserAdminAction(actor.id, deactivate(other))
    await expect(applyTrainerAdminAction('missing-trainer', other.id, { action: 'approve', revision: other.updatedAt.toISOString() })).rejects.toMatchObject({ status: 403 })
  })
  it('rejects a revoked actor and a missing target without mutation', async () => {
    await prisma.user.update({ where: { id: actor.id }, data: { role: 'PARENT' } })
    await expect(applyUserAdminAction(actor.id, change(parent, 'ADMIN'))).rejects.toMatchObject({ status: 403 })
    await expect(applyUserAdminAction(other.id, { ...deactivate(parent), userId: 'missing' })).rejects.toMatchObject({ status: 404 })
  })
  it.each(['change_role', 'delete'] as const)('rolls every write back if the real audit constraint fails after %s', async action => {
    const input = action === 'change_role' ? { ...change(parent, 'TRAINER'), firstName: 'Synthetic', lastName: 'Coach' } : deactivate(parent)
    await independent.$executeRawUnsafe(`ALTER TABLE admin_actions ADD CONSTRAINT trainr_account_audit_failure CHECK ("targetId" <> '${parent.id}') NOT VALID`)
    try {
      await expect(applyUserAdminAction(actor.id, input)).rejects.toThrow()
      expect(await independent.user.findUniqueOrThrow({ where: { id: parent.id } })).toMatchObject({ email: parent.email, role: 'PARENT', sessionVersion: 0, deletedAt: null, updatedAt: parent.updatedAt })
      expect(await independent.trainerProfile.findUnique({ where: { userId: parent.id } })).toBeNull()
      expect(await independent.adminAction.count({ where: { targetId: parent.id } })).toBe(0)
    } finally { await independent.$executeRawUnsafe('ALTER TABLE admin_actions DROP CONSTRAINT trainr_account_audit_failure') }
    await applyUserAdminAction(actor.id, input)
    expect(await independent.adminAction.count({ where: { targetId: parent.id } })).toBe(1)
  })
  it('retains bookings, payments and provider identifiers while closing a trainer account', async () => {
    const trainer = await create('TRAINER')
    const profile = await prisma.trainerProfile.findUniqueOrThrow({ where: { userId: trainer.id } })
    const parentProfile = await prisma.parentProfile.findUniqueOrThrow({ where: { userId: parent.id } })
    const athlete = await prisma.athleteProfile.create({ data: { parentProfileId: parentProfile.id, firstName: 'Synthetic', lastName: 'Athlete', dateOfBirth: new Date('2015-01-01'), goals: [] } })
    const service = await prisma.serviceOffering.create({ data: { trainerProfileId: profile.id, title: 'Synthetic service', priceInCents: 6000 } })
    const booking = await prisma.booking.create({ data: { parentProfileId: parentProfile.id, trainerProfileId: profile.id, athleteProfileId: athlete.id, serviceOfferingId: service.id,
      date: new Date('2030-01-01'), startTime: '09:00', endTime: '10:00', totalAmountInCents: 6000, platformFeeInCents: 900, trainerPayoutInCents: 5100,
      payment: { create: { amountInCents: 6000, platformFeeInCents: 900, trainerPayoutInCents: 5100, status: 'SUCCEEDED', stripePaymentIntentId: 'pi_synthetic_retained' } } } })
    await applyUserAdminAction(actor.id, deactivate(trainer))
    expect(await independent.booking.findUnique({ where: { id: booking.id } })).not.toBeNull()
    expect(await independent.payment.findUnique({ where: { bookingId: booking.id } })).toMatchObject({ status: 'SUCCEEDED', stripePaymentIntentId: 'pi_synthetic_retained' })
    expect(await independent.trainerProfile.findUnique({ where: { id: profile.id } })).toMatchObject({ isActive: false, firstName: 'Deleted' })
    expect(await independent.serviceOffering.findUnique({ where: { id: service.id } })).toMatchObject({ isActive: false })
    const updated = await independent.user.findUniqueOrThrow({ where: { id: trainer.id } })
    expect(updated.deletedAt).not.toBeNull()
    await expect(applyUserAdminAction(actor.id, change(updated, 'PARENT'))).rejects.toMatchObject({ status: 409 })
    expect(await resolveSessionUser({ sub: trainer.id, role: 'TRAINER', sessionVersion: updated.sessionVersion })).toBeNull()
    await prisma.user.update({ where: { id: trainer.id }, data: { passwordHash: await hash('Synthetic-123456', 4) } })
    expect(await authOptions.providers[0].options.authorize({ email: updated.email, password: 'Synthetic-123456' })).toBeNull()
    const closedProfile = await independent.trainerProfile.findUniqueOrThrow({ where: { id: profile.id } })
    await expect(applyTrainerAdminAction(profile.id, actor.id, { action: 'toggle_active', isActive: true, revision: closedProfile.updatedAt.toISOString() })).rejects.toMatchObject({ status: 409 })
  })
  it('deactivates a trainer listing on role change and does not silently reactivate it on return', async () => {
    const trainer = await create('TRAINER')
    await applyUserAdminAction(actor.id, change(trainer, 'PARENT'))
    const changed = await independent.user.findUniqueOrThrow({ where: { id: trainer.id } })
    const profile = await independent.trainerProfile.findUniqueOrThrow({ where: { userId: trainer.id } })
    expect(profile.isActive).toBe(false)
    await expect(applyTrainerAdminAction(profile.id, actor.id, { action: 'approve', revision: profile.updatedAt.toISOString() })).rejects.toMatchObject({ status: 409 })
    await applyUserAdminAction(actor.id, change(changed, 'TRAINER'))
    expect(await independent.trainerProfile.findUnique({ where: { userId: trainer.id } })).toMatchObject({ id: profile.id, isActive: false })
  })
})
