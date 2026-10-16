import { randomUUID } from 'node:crypto'
import { beforeEach, expect, it, vi } from 'vitest'
import { preparePackagePurchase, readPackageOffer } from '@/lib/package-purchases'

const mock = vi.hoisted(() => ({ transaction: vi.fn(), create: vi.fn(), package: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: mock.transaction } }))

const revision = new Date('2030-01-01T00:00:00.000Z')
const catalog = (ready: boolean, accountId: string | null = 'acct_synthetic') => ({
  id: 'package', trainerProfileId: 'trainer', title: 'Two sessions', description: '', isActive: true,
  totalSessions: 2, validForDays: 90, priceInCents: 9000, updatedAt: revision,
  trainerProfile: { id: 'trainer', firstName: 'Synthetic', lastName: 'Trainer', slug: 'synthetic-trainer',
    isActive: true, approvalStatus: 'APPROVED', timeZone: 'UTC', stripeAccountId: accountId,
    stripeOnboardingComplete: ready, user: { role: 'TRAINER', deletedAt: null }, sports: [{ sportId: 'sport' }] },
  items: [{ serviceOfferingId: 'service', sessionsCount: 2, serviceOffering: { id: 'service', title: 'Training',
    sportId: 'sport', durationMinutes: 60, type: 'INDIVIDUAL', isActive: true, trainerProfileId: 'trainer',
    sport: { isActive: true } } }],
})

beforeEach(() => {
  vi.resetAllMocks()
  mock.package.mockResolvedValue(catalog(false))
  mock.transaction.mockImplementation(run => run({
    $queryRaw: async () => [],
    user: { findUnique: async () => ({ role: 'PARENT', deletedAt: null, parentProfile: { id: 'parent' } }) },
    parentProfile: { findUnique: async () => ({ id: 'parent' }) },
    package: { findUnique: async (args: { select?: unknown }) => args.select ? { trainerProfileId: 'trainer' } : mock.package() },
    packagePurchase: { findUnique: async () => null, create: mock.create },
    feeConfig: { findMany: async () => [] },
  }))
})

it.each(['missing', 'incomplete'])('holds the offer and refuses a new pending purchase when Connect is %s', async condition => {
  mock.package.mockResolvedValue(catalog(false, condition === 'missing' ? null : 'acct_synthetic'))
  const offer = await readPackageOffer('parent-user', 'package')
  expect(offer).toMatchObject({ canCheckout: false, hold: 'Trainer must finish Stripe setup before checkout.' })
  await expect(preparePackagePurchase('parent-user', {
    requestId: randomUUID(), packageId: 'package', catalogRevision: revision.toISOString(), expectedTotalInCents: 9000,
  })).rejects.toMatchObject({ status: 409, message: offer.hold })
  expect(mock.create).not.toHaveBeenCalled()
})

it('allows a ready offer and creates one reviewed purchase snapshot', async () => {
  mock.package.mockResolvedValue(catalog(true))
  mock.create.mockImplementation(async ({ data }) => data)
  expect((await readPackageOffer('parent-user', 'package')).canCheckout).toBe(true)
  const saved = await preparePackagePurchase('parent-user', {
    requestId: randomUUID(), packageId: 'package', catalogRevision: revision.toISOString(), expectedTotalInCents: 9000,
  })
  expect(saved).toMatchObject({ amountInCents: 9000, platformFeeInCents: 1350, trainerPayoutInCents: 7650 })
  expect(mock.create).toHaveBeenCalledTimes(1)
})
