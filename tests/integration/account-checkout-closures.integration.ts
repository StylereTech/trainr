import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { closeAccount } from '@/lib/account-closure'
import { preparePackagePurchase } from '@/lib/package-purchases'
import { processAccountCheckoutClosure, processInitialAccountCheckouts, readAccountCheckoutClosures } from '@/lib/account-checkout-closures'
import { GET, POST } from '@/app/api/admin/checkout-closures/route'

const provider = vi.hoisted(() => ({ retrieve: vi.fn(), expire: vi.fn(), intent: vi.fn() }))
const auth = vi.hoisted(() => ({ session: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getServerSession: auth.session }))
vi.mock('@/lib/stripe', () => ({ stripe: { checkout: { sessions: { retrieve: provider.retrieve, expire: provider.expire } }, paymentIntents: { retrieve: provider.intent } } }))
const independent = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL })
let ids: string[] = [], parentId: string, trainerId: string, adminId: string, sportId: string, paymentId: string, purchaseId: string
let sessions: Record<string, any>, verified = false
const close = (id: string) => prisma.$transaction(async tx => { await tx.$queryRaw`SELECT id FROM users WHERE id = ${id} FOR UPDATE`; await closeAccount(tx, id) })
const task = (kind = 'BOOKING') => prisma.accountCheckoutClosure.findUniqueOrThrow({ where: { kind_targetId: { kind, targetId: kind === 'BOOKING' ? paymentId : purchaseId } } })
const processTask = async (kind = 'BOOKING') => processAccountCheckoutClosure((await task(kind)).id, { adminId })
beforeAll(async () => {
  expect(await prisma.$queryRaw`SELECT purpose FROM trainr_test_guard`).toEqual([{ purpose: 'disposable integration database' }]); verified = true
})
beforeEach(async () => {
  vi.resetAllMocks(); ids = []
  const key = randomUUID()
  const parent = await prisma.user.create({ data: { email: `closure-parent-${key}@example.test`, role: 'PARENT', passwordHash: 'not-a-login', parentProfile: { create: {} } }, include: { parentProfile: true } })
  parentId = parent.id; ids.push(parentId)
  const admin = await prisma.user.create({ data: { email: `closure-admin-${key}@example.test`, role: 'ADMIN', passwordHash: 'not-a-login' } }); adminId = admin.id; ids.push(adminId)
  const sport = await prisma.sport.create({ data: { name: key, slug: key } }); sportId = sport.id
  const trainer = await prisma.user.create({ data: { email: `closure-trainer-${key}@example.test`, role: 'TRAINER', passwordHash: 'not-a-login',
    trainerProfile: { create: { firstName: 'Synthetic', lastName: 'Trainer', slug: key, approvalStatus: 'APPROVED', stripeAccountId: 'acct_synthetic',
      sports: { create: { sportId } }, serviceOfferings: { create: { title: 'Synthetic service', priceInCents: 6000, sportId } } } } },
    include: { trainerProfile: { include: { serviceOfferings: true } } } })
  trainerId = trainer.id; ids.push(trainerId)
  const trainerProfileId = trainer.trainerProfile!.id, service = trainer.trainerProfile!.serviceOfferings[0]
  const athlete = await prisma.athleteProfile.create({ data: { parentProfileId: parent.parentProfile!.id, firstName: 'Synthetic', lastName: 'Athlete', dateOfBirth: new Date('2015-01-01') } })
  const booking = await prisma.booking.create({ data: { parentProfileId: parent.parentProfile!.id, trainerProfileId, athleteProfileId: athlete.id, serviceOfferingId: service.id,
    date: new Date('2030-01-01'), startTime: '09:00', endTime: '10:00', totalAmountInCents: 6000, platformFeeInCents: 900, trainerPayoutInCents: 5100,
    payment: { create: { amountInCents: 6000, platformFeeInCents: 900, trainerPayoutInCents: 5100 } } }, include: { payment: true } })
  paymentId = booking.payment!.id
  const bookingAttempt = await prisma.checkoutAttempt.create({ data: { paymentId, sequence: 1, parameters: {}, stripeCheckoutSessionId: `cs_booking_${key}` } })
  await prisma.payment.update({ where: { id: paymentId }, data: { stripeCheckoutSessionId: bookingAttempt.stripeCheckoutSessionId } })
  const catalog = await prisma.package.create({ data: { trainerProfileId, title: 'Shared sessions', totalSessions: 2, priceInCents: 6000, items: { create: { serviceOfferingId: service.id, sessionsCount: 2 } } } })
  const purchase = await preparePackagePurchase(parentId, { requestId: key, packageId: catalog.id, catalogRevision: catalog.updatedAt.toISOString(), expectedTotalInCents: 6000 }); purchaseId = purchase.id
  const packageAttempt = await prisma.packageCheckoutAttempt.create({ data: { purchaseId, sequence: 1, parameters: {}, stripeCheckoutSessionId: `cs_package_${key}` } })
  await prisma.packagePurchase.update({ where: { id: purchaseId }, data: { stripeCheckoutSessionId: packageAttempt.stripeCheckoutSessionId } })
  const common = { mode: 'payment', status: 'open', payment_status: 'unpaid', payment_intent: null, currency: 'usd', amount_total: 6000, livemode: false }
  sessions = { BOOKING: { ...common, id: bookingAttempt.stripeCheckoutSessionId, metadata: { bookingId: booking.id, paymentId, checkoutAttemptId: bookingAttempt.id } },
    PACKAGE: { ...common, id: packageAttempt.stripeCheckoutSessionId, metadata: { paymentKind: 'package', packagePurchaseId: purchaseId, packageCheckoutAttemptId: packageAttempt.id } } }
  provider.retrieve.mockImplementation(async id => structuredClone(Object.values(sessions).find(session => session.id === id)))
  provider.expire.mockImplementation(async id => { const session = Object.values(sessions).find(value => value.id === id); session.status = 'expired'; return structuredClone(session) })
  auth.session.mockResolvedValue({ user: { id: adminId, role: 'ADMIN' } })
})
afterEach(async () => {
  if (!verified) return
  await prisma.packagePurchase.deleteMany({ where: { id: purchaseId } })
  await prisma.booking.deleteMany({ where: { parentProfile: { userId: parentId } } })
  await prisma.adminAction.deleteMany({ where: { adminUserId: adminId } })
  await prisma.user.deleteMany({ where: { id: { in: ids } } })
  await prisma.sport.delete({ where: { id: sportId } })
})
afterAll(async () => { await prisma.$disconnect(); await independent.$disconnect() })

describe('durable account checkout closure with real SQL and simulated provider', () => {
  it.each(['parent', 'trainer'])('queues both financial surfaces when the %s closes, without erasing history', async role => {
    const before = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })
    await close(role === 'parent' ? parentId : trainerId)
    expect(await independent.accountCheckoutClosure.count()).toBe(2)
    expect(await independent.payment.findUniqueOrThrow({ where: { id: paymentId } })).toEqual(before)
    await close(parentId); await close(trainerId)
    expect(await independent.accountCheckoutClosure.count()).toBe(2)
    expect(provider.expire).not.toHaveBeenCalled()
  })
  it('rolls queued work back with a failed closure transaction', async () => {
    await expect(prisma.$transaction(async tx => { await tx.$queryRaw`SELECT id FROM users WHERE id = ${parentId} FOR UPDATE`; await closeAccount(tx, parentId); throw new Error('synthetic rollback') })).rejects.toThrow('synthetic rollback')
    expect(await independent.accountCheckoutClosure.count()).toBe(0)
    expect((await independent.user.findUniqueOrThrow({ where: { id: parentId } })).deletedAt).toBeNull()
  })
  for (const kind of ['BOOKING', 'PACKAGE']) {
    it(`${kind} expires exactly once across concurrent retries without touching money`, async () => {
      await close(parentId)
      const before = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })
      expect(await Promise.all([processTask(kind), processTask(kind), processTask(kind)])).toEqual(Array(3).fill(expect.objectContaining({ status: 'CLOSED', outcome: 'expired_unpaid' })))
      expect(provider.expire).toHaveBeenCalledTimes(1)
      expect(await independent.payment.findUniqueOrThrow({ where: { id: paymentId } })).toEqual(before)
      expect(await independent.walletEntry.count()).toBe(0); expect(await independent.packageCreditGrant.count()).toBe(0)
    })
    it.each(['paid', 'processing', 'recoverable', 'wrong_id', 'wrong_amount', 'wrong_metadata', 'provider_failure'])(`${kind} keeps %s in review`, async scenario => {
      await close(parentId)
      const session = sessions[kind]
      if (scenario === 'paid') Object.assign(session, { status: 'complete', payment_status: 'paid' })
      if (scenario === 'processing') Object.assign(session, { status: 'complete', payment_status: 'unpaid', payment_intent: 'pi_processing' })
      if (scenario === 'recoverable') session.after_expiration = { recovery: { enabled: true } }
      if (scenario === 'wrong_id') provider.retrieve.mockResolvedValue({ ...session, id: 'cs_unrelated' })
      if (scenario === 'wrong_amount') session.amount_total++
      if (scenario === 'wrong_metadata') session.metadata = {}
      if (scenario === 'provider_failure') provider.retrieve.mockRejectedValue(new Error('synthetic provider unavailable'))
      expect(await processTask(kind)).toMatchObject({ status: 'REVIEW' })
      expect(provider.expire).not.toHaveBeenCalled()
      expect((await task(kind)).checkedAt).not.toBeNull()
    })
    it(`${kind} re-reads Stripe after a lost expire response`, async () => {
      await close(parentId)
      provider.expire.mockImplementation(async () => { sessions[kind].status = 'expired'; throw new Error('lost response') })
      expect(await processTask(kind)).toMatchObject({ status: 'CLOSED' })
      expect(provider.retrieve).toHaveBeenCalledTimes(2)
    })
    it.each(['canceled', 'processing', 'wrong_id'])(`${kind} verifies the linked intent is %s`, async state => {
      await close(parentId); sessions[kind].payment_intent = 'pi_synthetic'
      provider.intent.mockResolvedValue({ id: state === 'wrong_id' ? 'pi_other' : 'pi_synthetic', status: state })
      expect(await processTask(kind)).toMatchObject({ status: state === 'canceled' ? 'CLOSED' : 'REVIEW' })
    })
    it(`${kind} does not treat an expired link as proof that recorded funds are resolved`, async () => {
      await close(parentId)
      if (kind === 'BOOKING') await prisma.payment.update({ where: { id: paymentId }, data: { status: 'SUCCEEDED' } })
      else await prisma.packagePurchase.update({ where: { id: purchaseId }, data: { status: 'SUCCEEDED' } })
      expect(await processTask(kind)).toMatchObject({ status: 'REVIEW', outcome: 'payment_review_required' })
    })
  }
  it('retains an unattached original attempt for review, then closes it after late identity attachment', async () => {
    await prisma.checkoutAttempt.updateMany({ where: { paymentId }, data: { stripeCheckoutSessionId: null } })
    await prisma.payment.update({ where: { id: paymentId }, data: { stripeCheckoutSessionId: null } })
    await close(parentId)
    expect(await processTask()).toMatchObject({ status: 'REVIEW', outcome: 'missing_session_identity' })
    expect(provider.retrieve).not.toHaveBeenCalled()
    await prisma.checkoutAttempt.updateMany({ where: { paymentId }, data: { stripeCheckoutSessionId: sessions.BOOKING.id } })
    await prisma.payment.update({ where: { id: paymentId }, data: { stripeCheckoutSessionId: sessions.BOOKING.id } })
    expect(await processTask()).toMatchObject({ status: 'CLOSED' })
  })
  it('initial closure work is bounded and leaves all remaining tasks visible', async () => {
    await close(parentId); await processInitialAccountCheckouts(parentId)
    expect(await independent.accountCheckoutClosure.count({ where: { status: 'CLOSED' } })).toBe(1)
    expect(await independent.accountCheckoutClosure.count({ where: { status: 'PENDING' } })).toBe(1)
    const rows = await readAccountCheckoutClosures(adminId, 1)
    expect(rows.total).toBe(2); expect(JSON.stringify(rows)).not.toContain('cs_'); expect(JSON.stringify(rows)).not.toContain('@')
  })
  it.each(['missing_outcome', 'empty_session'])('SQL rejects CLOSED with %s proof', async condition => {
    await close(parentId)
    await expect(prisma.accountCheckoutClosure.update({ where: { id: (await task()).id }, data: {
      status: 'CLOSED', checkedAt: new Date(), outcome: condition === 'missing_outcome' ? null : 'expired_unpaid',
      sessionId: condition === 'empty_session' ? '' : 'cs_synthetic',
    } })).rejects.toThrow()
    expect((await task()).status).toBe('PENDING')
  })
  it('rejects a revoked administrator and unrelated closed-user authority before provider calls', async () => {
    await close(parentId)
    await expect(processAccountCheckoutClosure((await task()).id, { closedUserId: trainerId })).rejects.toThrow('not found')
    await prisma.user.update({ where: { id: adminId }, data: { role: 'PARENT' } })
    await expect(processTask()).rejects.toThrow('Administrator')
    await expect(readAccountCheckoutClosures(adminId, 1)).rejects.toThrow('Administrator')
    expect(provider.retrieve).not.toHaveBeenCalled()
  })
  it('leaves provider-expired work retryable when the audit transaction rolls back', async () => {
    await close(parentId)
    const id = (await task()).id
    await independent.$executeRawUnsafe(`ALTER TABLE admin_actions ADD CONSTRAINT closure_audit_failure CHECK ("targetId" <> '${id}') NOT VALID`)
    try {
      await expect(processTask()).rejects.toThrow()
      expect((await task()).status).toBe('PENDING')
    } finally { await independent.$executeRawUnsafe('ALTER TABLE admin_actions DROP CONSTRAINT closure_audit_failure') }
    expect(await processTask()).toMatchObject({ status: 'CLOSED' }); expect(provider.expire).toHaveBeenCalledTimes(1)
  })
  it('protects route access and validates actions before provider work', async () => {
    await close(parentId)
    const request = (body: unknown) => new NextRequest('http://localhost/api/admin/checkout-closures', { method: 'POST', body: JSON.stringify(body) })
    auth.session.mockResolvedValue({ user: { id: parentId, role: 'PARENT' } })
    expect((await GET(new NextRequest('http://localhost/api/admin/checkout-closures'))).status).toBe(401)
    expect((await POST(request({ id: (await task()).id }))).status).toBe(401)
    auth.session.mockResolvedValue({ user: { id: adminId, role: 'ADMIN' } })
    expect((await POST(request({ id: (await task()).id, refund: true }))).status).toBe(400)
    expect((await GET(new NextRequest('http://localhost/api/admin/checkout-closures?page=-1'))).status).toBe(400)
    expect((await POST(request({ id: (await task()).id }))).status).toBe(200)
  })
})
