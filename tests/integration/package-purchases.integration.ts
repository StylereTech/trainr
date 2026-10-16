import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { preparePackagePurchase } from '@/lib/package-purchases'
import { approvedPackageCreditPolicy, packagePurchaseTermsSchema } from '@/lib/package-purchase-schema'
import { saveTrainerPackage } from '@/lib/trainer-packages'

const independent = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL })
let parentId: string, parentProfileId: string, otherParentId: string, trainerId: string, trainerProfileId: string
let sportId: string, serviceId: string, packageId: string, revision: string
let verified = false
const input = (change = {}) => ({ requestId: randomUUID(), packageId, catalogRevision: revision, expectedTotalInCents: 25000, ...change })

beforeAll(async () => {
  expect(await prisma.$queryRaw`SELECT purpose FROM trainr_test_guard`).toEqual([{ purpose: 'disposable integration database' }])
  const [identity] = await prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`
  expect(identity.name).toMatch(/^trainr_audit_/)
  verified = true
})
beforeEach(async () => {
  const key = randomUUID()
  const sport = await prisma.sport.create({ data: { name: `Purchase ${key}`, slug: key } }); sportId = sport.id
  const trainer = await prisma.user.create({ data: { email: `purchase-trainer-${key}@example.test`, passwordHash: 'not-a-login', role: 'TRAINER',
    trainerProfile: { create: { firstName: 'Synthetic', lastName: 'Trainer', slug: key, approvalStatus: 'APPROVED', stripeAccountId: 'acct_synthetic', stripeOnboardingComplete: true, sports: { create: { sportId } },
      serviceOfferings: { create: { title: 'Training', sportId, priceInCents: 6000 } } } } }, include: { trainerProfile: { include: { serviceOfferings: true } } } })
  trainerId = trainer.id; trainerProfileId = trainer.trainerProfile!.id; serviceId = trainer.trainerProfile!.serviceOfferings[0].id
  const parent = await prisma.user.create({ data: { email: `purchase-parent-${key}@example.test`, passwordHash: 'not-a-login', role: 'PARENT', parentProfile: { create: {
    athletes: { create: ['One', 'Two'].map(firstName => ({ firstName, lastName: 'Synthetic', dateOfBirth: new Date('2015-01-01'), goals: [] })) },
  } } }, include: { parentProfile: true } })
  parentId = parent.id; parentProfileId = parent.parentProfile!.id
  const other = await prisma.user.create({ data: { email: `purchase-other-${key}@example.test`, passwordHash: 'not-a-login', role: 'PARENT', parentProfile: { create: {} } } }); otherParentId = other.id
  const catalog = await prisma.package.create({ data: { trainerProfileId, title: 'Five sessions', description: 'Synthetic offer', totalSessions: 5,
    priceInCents: 25000, validForDays: 90, items: { create: { serviceOfferingId: serviceId, sessionsCount: 5 } } } })
  packageId = catalog.id; revision = catalog.updatedAt.toISOString()
})
afterEach(async () => {
  if (!verified) return
  await prisma.packagePurchase.deleteMany({ where: { trainerProfileId } })
  await prisma.user.deleteMany({ where: { id: { in: [parentId, otherParentId, trainerId] } } })
  await prisma.sport.delete({ where: { id: sportId } })
})
afterAll(async () => { await prisma.$disconnect(); await independent.$disconnect() })

describe('real SQL family-shared pending package purchases', () => {
  it.each(['missing', 'incomplete'])('does not create a new purchase when trainer Connect is %s', async condition => {
    await prisma.trainerProfile.update({ where: { id: trainerProfileId }, data: condition === 'missing'
      ? { stripeAccountId: null, stripeOnboardingComplete: false } : { stripeOnboardingComplete: false } })
    await expect(preparePackagePurchase(parentId, input())).rejects.toMatchObject({ status: 409, message: expect.stringContaining('Stripe setup') })
    expect(await independent.packagePurchase.count({ where: { parentProfileId } })).toBe(0)
  })
  it('persists owned reviewed terms independently without a child, charge, booking or wallet entry', async () => {
    const saved = await preparePackagePurchase(parentId, input())
    const reloaded = await independent.packagePurchase.findUniqueOrThrow({ where: { id: saved.id } })
    expect(reloaded).toMatchObject({ parentProfileId, trainerProfileId, packageId, status: 'PENDING',
      amountInCents: 25000, platformFeeInCents: 3750, trainerPayoutInCents: 21250 })
    expect(packagePurchaseTermsSchema.parse(reloaded.terms)).toMatchObject({ version: 2, creditPolicy: approvedPackageCreditPolicy,
      totalSessions: 5, validForDays: 90,
      items: [{ serviceOfferingId: serviceId, sessionsCount: 5, title: 'Training', durationMinutes: 60 }] })
    expect(reloaded).not.toHaveProperty('athleteProfileId')
    expect(await prisma.athleteProfile.count({ where: { parentProfileId } })).toBe(2)
    expect(await prisma.payment.count()).toBe(0)
    expect(await prisma.booking.count()).toBe(0)
    expect(await prisma.walletEntry.count()).toBe(0)
  })
  it('rejects policy rewrites and incomplete version-two records at the SQL boundary', async () => {
    const saved = await preparePackagePurchase(parentId, input())
    const terms = packagePurchaseTermsSchema.parse(saved.terms)
    await expect(independent.packagePurchase.update({ where: { id: saved.id }, data: {
      terms: { ...terms, creditPolicy: { ...approvedPackageCreditPolicy, parentCancellationRestoreHours: 12 } },
    } })).rejects.toThrow()
    const { id: _id, financialReview: _review, ...data } = saved
    await expect(independent.packagePurchase.create({ data: { ...data, requestId: randomUUID(),
      terms: { ...terms, creditPolicy: { ownership: 'PARENT_CHILDREN' } },
    } })).rejects.toThrow()
    expect(await independent.packagePurchase.findUniqueOrThrow({ where: { id: saved.id } })).toEqual(saved)
  })
  it('serializes simultaneous identical retries into one purchase', async () => {
    const command = input()
    const results = await Promise.all([preparePackagePurchase(parentId, command), preparePackagePurchase(parentId, command)])
    expect(results[0].id).toBe(results[1].id)
    expect(await independent.packagePurchase.count({ where: { parentProfileId } })).toBe(1)
  })
  it('replays legacy snapshots without attaching the new policy retroactively', async () => {
    const command = input(), saved = await preparePackagePurchase(parentId, command)
    const parsed = packagePurchaseTermsSchema.parse(saved.terms)
    expect(parsed.version).toBe(2)
    if (parsed.version !== 2) throw new Error('Expected current purchase policy')
    const { creditPolicy: _policy, ...legacyTerms } = parsed
    const { id: _id, financialReview: _review, ...data } = saved
    const legacyRequestId = randomUUID()
    const legacy = await independent.packagePurchase.create({ data: { ...data, requestId: legacyRequestId,
      terms: { ...legacyTerms, version: 1 },
    } })
    expect(await preparePackagePurchase(parentId, { ...command, requestId: legacyRequestId })).toEqual(legacy)
    expect(packagePurchaseTermsSchema.parse(legacy.terms)).not.toHaveProperty('creditPolicy')
  })
  it.each(Object.keys(approvedPackageCreditPolicy))('rejects an unapproved SQL %s policy value', async key => {
    const saved = await preparePackagePurchase(parentId, input())
    const terms = packagePurchaseTermsSchema.parse(saved.terms)
    const { id: _id, financialReview: _review, ...data } = saved
    await expect(independent.packagePurchase.create({ data: { ...data, requestId: randomUUID(),
      terms: { ...terms, creditPolicy: { ...approvedPackageCreditPolicy, [key]: 'unapproved' } },
    } })).rejects.toThrow()
    expect(await independent.packagePurchase.count({ where: { parentProfileId } })).toBe(1)
  })
  it('keeps separate immutable quantities for a mixed-service package', async () => {
    const second = await prisma.serviceOffering.create({ data: { trainerProfileId, sportId, title: 'Group training', priceInCents: 3000, type: 'GROUP', durationMinutes: 90 } })
    await prisma.packageItem.create({ data: { packageId, serviceOfferingId: second.id, sessionsCount: 3 } })
    const changed = await prisma.package.update({ where: { id: packageId }, data: { totalSessions: 8 } })
    const saved = await preparePackagePurchase(parentId, input({ catalogRevision: changed.updatedAt.toISOString() }))
    const terms = packagePurchaseTermsSchema.parse(saved.terms)
    expect(terms.totalSessions).toBe(8)
    expect(terms.items.find(item => item.serviceOfferingId === second.id)).toMatchObject({ sessionsCount: 3, type: 'GROUP', durationMinutes: 90 })
    expect(terms.items.find(item => item.serviceOfferingId === serviceId)?.sessionsCount).toBe(5)
  })
  it('retains its original server-calculated fee split after fee configuration changes', async () => {
    const command = input(), saved = await preparePackagePurchase(parentId, command)
    const config = await prisma.feeConfig.create({ data: { platformCommissionPercent: 20 } })
    try {
      expect(await preparePackagePurchase(parentId, command)).toEqual(saved)
      const next = await preparePackagePurchase(parentId, input())
      expect(next).toMatchObject({ platformFeeInCents: 5000, trainerPayoutInCents: 20000 })
    } finally { await prisma.feeConfig.delete({ where: { id: config.id } }) }
  })
  it('does not create a profile for an unknown purchaser or a parent without a profile', async () => {
    await expect(preparePackagePurchase('unknown-parent', input())).rejects.toMatchObject({ status: 403 })
    const other = await prisma.parentProfile.findUniqueOrThrow({ where: { userId: otherParentId } })
    await prisma.parentProfile.delete({ where: { id: other.id } })
    await expect(preparePackagePurchase(otherParentId, input())).rejects.toMatchObject({ status: 404 })
    expect(await independent.packagePurchase.count()).toBe(0)
  })
  it('scopes the same request ID to the authenticated parent, not another family', async () => {
    const command = input()
    const first = await preparePackagePurchase(parentId, command), second = await preparePackagePurchase(otherParentId, command)
    expect(first.id).not.toBe(second.id)
    expect(first.parentProfileId).not.toBe(second.parentProfileId)
  })
  it('rejects changed payloads on the same request without overwriting the purchase', async () => {
    const command = input(), saved = await preparePackagePurchase(parentId, command)
    await expect(preparePackagePurchase(parentId, { ...command, expectedTotalInCents: 26000 })).rejects.toMatchObject({ status: 409 })
    expect(await independent.packagePurchase.findUniqueOrThrow({ where: { id: saved.id } })).toEqual(saved)
  })
  it('replays the original purchase after catalog/service edits and deactivation', async () => {
    const command = input(), saved = await preparePackagePurchase(parentId, command)
    await saveTrainerPackage(trainerId, { action: 'save', id: packageId, revision, title: 'New offer', description: '', priceInCents: 30000,
      validForDays: 30, items: [{ serviceOfferingId: serviceId, sessionsCount: 3 }] })
    await prisma.serviceOffering.update({ where: { id: serviceId }, data: { title: 'Changed title', durationMinutes: 30 } })
    await prisma.package.update({ where: { id: packageId }, data: { isActive: false } })
    expect(await preparePackagePurchase(parentId, command)).toEqual(saved)
    expect(await independent.packagePurchase.findUniqueOrThrow({ where: { id: saved.id } })).toEqual(saved)
  })
  it.each(['trainer', 'admin', 'deleted'])('rechecks %s parent access even on replay', async mode => {
    const command = input()
    await preparePackagePurchase(parentId, command)
    await prisma.user.update({ where: { id: parentId }, data: mode === 'deleted' ? { deletedAt: new Date() } : { role: mode === 'admin' ? 'ADMIN' : 'TRAINER' } })
    await expect(preparePackagePurchase(parentId, command)).rejects.toMatchObject({ status: 403 })
  })
  it.each(['price', 'revision', 'inactive-package', 'inactive-trainer', 'unapproved', 'deleted-trainer', 'wrong-trainer-role',
    'inactive-service', 'inactive-sport', 'removed-sport', 'wrong-total', 'below-minimum', 'duplicate-service'])('rejects %s without persisting a purchase', async mode => {
    let command = input()
    if (mode === 'price') command = input({ expectedTotalInCents: 26000 })
    if (mode === 'revision') command = input({ catalogRevision: '2026-01-01T00:00:00.000Z' })
    if (mode === 'inactive-package') await prisma.package.update({ where: { id: packageId }, data: { isActive: false } })
    if (mode === 'inactive-trainer') await prisma.trainerProfile.update({ where: { id: trainerProfileId }, data: { isActive: false } })
    if (mode === 'unapproved') await prisma.trainerProfile.update({ where: { id: trainerProfileId }, data: { approvalStatus: 'PENDING' } })
    if (mode === 'deleted-trainer') await prisma.user.update({ where: { id: trainerId }, data: { deletedAt: new Date() } })
    if (mode === 'wrong-trainer-role') await prisma.user.update({ where: { id: trainerId }, data: { role: 'PARENT' } })
    if (mode === 'inactive-service') await prisma.serviceOffering.update({ where: { id: serviceId }, data: { isActive: false } })
    if (mode === 'inactive-sport') await prisma.sport.update({ where: { id: sportId }, data: { isActive: false } })
    if (mode === 'removed-sport') await prisma.trainerSport.deleteMany({ where: { trainerProfileId } })
    if (mode === 'wrong-total' || mode === 'below-minimum') {
      const changed = await prisma.package.update({ where: { id: packageId }, data: mode === 'wrong-total' ? { totalSessions: 7 } : { priceInCents: 100 } })
      command = input({ catalogRevision: changed.updatedAt.toISOString(), expectedTotalInCents: changed.priceInCents })
    }
    if (mode === 'duplicate-service') {
      await prisma.packageItem.create({ data: { packageId, serviceOfferingId: serviceId, sessionsCount: 5 } })
      const changed = await prisma.package.update({ where: { id: packageId }, data: { totalSessions: 10 } })
      command = input({ catalogRevision: changed.updatedAt.toISOString() })
    }
    await expect(preparePackagePurchase(parentId, command)).rejects.toMatchObject({ status: 409 })
    expect(await independent.packagePurchase.count({ where: { parentProfileId } })).toBe(0)
  })
  it('refuses a child or owner injected into the purchase request', async () => {
    await expect(preparePackagePurchase(parentId, input({ athleteProfileId: 'child', parentProfileId: 'other' }))).rejects.toThrow()
    expect(await independent.packagePurchase.count({ where: { parentProfileId } })).toBe(0)
  })
  it.each(['terms', 'owner', 'amount', 'request', 'catalog'])('protects immutable %s against direct SQL updates', async mode => {
    const saved = await preparePackagePurchase(parentId, input())
    const other = await prisma.parentProfile.findUniqueOrThrow({ where: { userId: otherParentId } })
    const data = mode === 'terms' ? { terms: { version: 1, title: 'Changed' } } : mode === 'owner' ? { parentProfileId: other.id } :
      mode === 'amount' ? { amountInCents: 26000, trainerPayoutInCents: 22250 } : mode === 'request' ? { requestId: randomUUID() } : { catalogRevision: new Date(0) }
    await expect(independent.packagePurchase.update({ where: { id: saved.id }, data })).rejects.toThrow(/immutable/)
    expect(await independent.packagePurchase.findUniqueOrThrow({ where: { id: saved.id } })).toEqual(saved)
  })
  it('retains purchase history when catalog deletion is attempted', async () => {
    const saved = await preparePackagePurchase(parentId, input())
    await expect(independent.package.delete({ where: { id: packageId } })).rejects.toThrow()
    expect(await independent.packagePurchase.findUniqueOrThrow({ where: { id: saved.id } })).toEqual(saved)
  })
  it.each(['amount', 'hash', 'version'])('enforces the SQL %s constraint for new records', async mode => {
    const saved = await preparePackagePurchase(parentId, input())
    const data = { parentProfileId: saved.parentProfileId, trainerProfileId: saved.trainerProfileId, packageId: saved.packageId,
      payloadHash: saved.payloadHash, catalogRevision: saved.catalogRevision, terms: saved.terms,
      amountInCents: saved.amountInCents, platformFeeInCents: saved.platformFeeInCents, trainerPayoutInCents: saved.trainerPayoutInCents }
    const change = mode === 'amount' ? { trainerPayoutInCents: 1 } : mode === 'hash' ? { payloadHash: 'not-a-hash' } : { terms: { version: 2 } }
    await expect(independent.packagePurchase.create({ data: { ...data, terms: packagePurchaseTermsSchema.parse(data.terms), requestId: randomUUID(), ...change } })).rejects.toThrow()
    expect(await independent.packagePurchase.count({ where: { parentProfileId } })).toBe(1)
  })
  it('rechecks catalog eligibility after waiting for a committed concurrent edit', async () => {
    let entered!: () => void, release!: () => void
    const started = new Promise<void>(resolve => { entered = resolve })
    const holder = independent.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM trainer_profiles WHERE id = ${trainerProfileId} FOR UPDATE`
      const wait = new Promise<void>(resolve => { release = resolve }); entered(); await wait
      await tx.package.update({ where: { id: packageId }, data: { isActive: false } })
    })
    await started
    const attempt = preparePackagePurchase(parentId, input()).then(value => ({ value }), error => ({ error }))
    try {
      await expect.poll(async () => {
        const [waiting] = await prisma.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int AS count FROM pg_stat_activity WHERE wait_event_type='Lock' AND cardinality(pg_blocking_pids(pid)) > 0`
        return waiting.count
      }).toBeGreaterThan(0)
    } finally { release(); await holder }
    expect(await attempt).toMatchObject({ error: { status: 409 } })
    expect(await independent.packagePurchase.count({ where: { parentProfileId } })).toBe(0)
  })
})
