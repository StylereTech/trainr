import { randomUUID } from 'node:crypto'
import { Prisma, PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { approvedPackageCreditPolicy } from '@/lib/package-purchase-schema'
import { redeemPackageCredit, restoreCancelledPackageCredit } from '@/lib/package-credit-ledger'
import { applyBookingAction } from '@/lib/booking-actions'
import { readDashboardBookings } from '@/lib/dashboard-bookings'
import { dashboardResponseSchema } from '@/lib/dashboard-contract'
import { NextRequest } from 'next/server'
import { encode } from 'next-auth/jwt'
import { createCreditBooking } from '@/lib/package-credit-booking'
import { createBooking } from '@/lib/booking-creation'
import { POST as creditPOST } from '@/app/api/bookings/credits/route'
import { readCreditBookingOptions } from '@/lib/credit-booking-options'
import { creditBookingOptions } from '@/lib/package-credit-booking-schema'

const independent = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL })
let parentId: string, parentProfileId: string, trainerId: string, trainerProfileId: string, otherId: string, otherProfileId: string
let sportId: string, serviceId: string, packageId: string, children: string[], otherChild: string, verified = false

beforeAll(async () => {
  expect(await prisma.$queryRaw`SELECT current_database() AS name, current_user AS owner, purpose FROM trainr_test_guard`).toEqual([
    { name: expect.stringMatching(/^trainr_audit_/), owner: 'trainr_test', purpose: 'disposable integration database' },
  ])
  verified = true
})
beforeEach(async () => {
  const key = randomUUID()
  sportId = (await prisma.sport.create({ data: { name: `Credit ledger ${key}`, slug: key } })).id
  const trainer = await prisma.user.create({ data: { email: `credit-trainer-${key}@example.test`, passwordHash: 'not-a-login', role: 'TRAINER',
    trainerProfile: { create: { firstName: 'Synthetic', lastName: 'Trainer', slug: key, approvalStatus: 'APPROVED', timeZone: 'UTC',
      sports: { create: { sportId } }, serviceOfferings: { create: { title: 'Training', sportId, priceInCents: 3000 } } } } },
    include: { trainerProfile: { include: { serviceOfferings: true } } } })
  trainerId = trainer.id; trainerProfileId = trainer.trainerProfile!.id; serviceId = trainer.trainerProfile!.serviceOfferings[0].id
  const parent = await prisma.user.create({ data: { email: `credit-parent-${key}@example.test`, passwordHash: 'not-a-login', role: 'PARENT',
    parentProfile: { create: { athletes: { create: ['One', 'Two'].map(firstName => ({ firstName, lastName: 'Synthetic', dateOfBirth: new Date('2015-01-01'),
      goals: [], sports: { create: { sportId } } })) } } } }, include: { parentProfile: { include: { athletes: true } } } })
  parentId = parent.id; parentProfileId = parent.parentProfile!.id; children = parent.parentProfile!.athletes.map(child => child.id)
  const other = await prisma.user.create({ data: { email: `credit-other-${key}@example.test`, passwordHash: 'not-a-login', role: 'PARENT',
    parentProfile: { create: { athletes: { create: { firstName: 'Unrelated', lastName: 'Synthetic', dateOfBirth: new Date('2015-01-01'), goals: [], sports: { create: { sportId } } } } } } },
    include: { parentProfile: { include: { athletes: true } } } })
  otherId = other.id; otherProfileId = other.parentProfile!.id; otherChild = other.parentProfile!.athletes[0].id
  packageId = (await prisma.package.create({ data: { trainerProfileId, title: 'Shared sessions', totalSessions: 2, priceInCents: 6000, validForDays: 90,
    items: { create: { serviceOfferingId: serviceId, sessionsCount: 2 } } } })).id
})
afterEach(async () => {
  vi.restoreAllMocks()
  if (!verified) return
  await prisma.booking.deleteMany({ where: { trainerProfileId } })
  await prisma.packagePurchase.deleteMany({ where: { trainerProfileId } })
  await prisma.user.deleteMany({ where: { id: { in: [parentId, trainerId, otherId] } } })
  await prisma.sport.delete({ where: { id: sportId } })
})
afterAll(async () => { await prisma.$disconnect(); await independent.$disconnect() })

// These are explicit synthetic SQL receipts, not evidence of a Stripe payment.
async function purchase(options: { sessions?: number; version?: 1 | 2; paidAt?: Date; receipt?: boolean; type?: 'INDIVIDUAL' | 'GROUP' } = {}) {
  const key = randomUUID().replaceAll('-', ''), sessions = options.sessions ?? 2, version = options.version ?? 2
  const paidAt = options.paidAt ?? new Date(Date.now() - 1000)
  const saved = await prisma.packagePurchase.create({ data: {
    parentProfileId, trainerProfileId, packageId, requestId: randomUUID(), payloadHash: 'a'.repeat(64), catalogRevision: new Date(),
    terms: { version, ...(version === 2 ? { creditPolicy: approvedPackageCreditPolicy } : {}), title: 'Shared sessions', description: '', validForDays: 90,
      totalSessions: sessions, items: [{ serviceOfferingId: serviceId, title: 'Training', sportId, durationMinutes: 60, type: options.type ?? 'INDIVIDUAL', sessionsCount: sessions }] },
    amountInCents: 6000, platformFeeInCents: 900, trainerPayoutInCents: 5100, status: 'SUCCEEDED', settlementVerifiedAt: new Date(),
    stripePaymentIntentId: `pi_${key}`, stripeChargeId: `ch_${key}`, stripeTransferId: `tr_${key}`, stripeCheckoutSessionId: `cs_${key}`,
    createdAt: new Date(paidAt.getTime() - 1000),
  } })
  await prisma.packageCreditGrant.create({ data: { purchaseId: saved.id, serviceOfferingId: serviceId, sessionsCount: sessions } })
  if (options.receipt !== false) await prisma.packagePaymentReceipt.create({ data: { purchaseId: saved.id, stripeEventId: `evt_${key}`,
    stripePaymentIntentId: `pi_${key}`, stripeChargeId: `ch_${key}`, stripeCheckoutSessionId: `cs_${key}`, livemode: false, paidAt } })
  return saved
}
async function booking(changes: Partial<Prisma.BookingUncheckedCreateInput> = {}) {
  const startsAt = changes.startsAt instanceof Date ? changes.startsAt : new Date(Date.now() + 3 * 86400000)
  const endsAt = new Date(startsAt.getTime() + 3600000)
  return prisma.booking.create({ data: { parentProfileId, trainerProfileId, athleteProfileId: children[0], serviceOfferingId: serviceId,
    date: new Date(`${startsAt.toISOString().slice(0, 10)}T00:00:00Z`), startTime: startsAt.toISOString().slice(11, 16), endTime: endsAt.toISOString().slice(11, 16),
    timeZone: 'UTC', startsAt, endsAt, status: 'CONFIRMED', totalAmountInCents: 0, platformFeeInCents: 0, trainerPayoutInCents: 0, ...changes } })
}
const rawSpend = (purchaseId: string, bookingId: string) => independent.packageCreditRedemption.create({ data: { purchaseId, bookingId, serviceOfferingId: serviceId } })
const spend = (purchaseId: string, bookingId: string, actor = parentId) => prisma.$transaction(tx => redeemPackageCredit(tx, actor, purchaseId, bookingId))
const restore = (bookingId: string, actor = { id: parentId, role: 'PARENT' }) => prisma.$transaction(tx => restoreCancelledPackageCredit(tx, actor, bookingId))
const cancel = (bookingId: string) => prisma.booking.update({ where: { id: bookingId }, data: { status: 'CANCELLED' } })
const paymentData = (bookingId: string) => ({ bookingId, amountInCents: 0, platformFeeInCents: 0, trainerPayoutInCents: 0, status: 'SUCCEEDED' as const })

describe('atomic parent credit reservation endpoint', () => {
  const secret = 'local-credit-reservation-test-only'
  beforeAll(() => { vi.stubEnv('NEXTAUTH_SECRET', secret) })
  afterAll(() => { vi.unstubAllEnvs() })
  beforeEach(async () => {
    await prisma.availabilitySlot.createMany({ data: Array.from({ length: 7 }, (_, dayOfWeek) => ({ trainerProfileId, dayOfWeek, startTime: '08:00', endTime: '18:00' })) })
  })
  const request = (purchaseId: string) => ({ purchaseId, requestId: randomUUID(), serviceOfferingId: serviceId, athleteProfileId: children[0],
    date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10), startTime: '09:00', timeZone: 'UTC', notes: 'Synthetic credit reservation' })
  async function post(body: unknown, userId: string | null = parentId) {
    const user = userId ? await prisma.user.findUniqueOrThrow({ where: { id: userId } }) : null
    const token = user ? await encode({ secret, token: { sub: user.id, role: user.role, sessionVersion: user.sessionVersion } }) : null
    return creditPOST(new NextRequest('http://localhost/api/bookings/credits', { method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { cookie: `next-auth.session-token=${token}` } : {}) }, body: JSON.stringify(body) }))
  }
  async function assertEmpty() {
    expect(await independent.booking.count()).toBe(0)
    expect(await independent.packageCreditRedemption.count()).toBe(0)
    expect(await independent.bookingCreateRequest.count()).toBe(0)
    expect(await independent.notification.count()).toBe(0)
    expect(await independent.payment.count()).toBe(0)
    expect(await independent.walletEntry.count()).toBe(0)
  }
  it('reads a safe owned balance, then reflects spending and restoration independently', async () => {
    const p = await purchase()
    const first = creditBookingOptions.parse(await readCreditBookingOptions(parentId, p.id))
    expect(first.services[0]).toMatchObject({ availableCredits: 2, hold: null })
    expect(first.athletes.map(child => child.id).sort()).toEqual([...children].sort())
    expect(JSON.stringify(first)).not.toContain(p.stripePaymentIntentId!)
    expect(JSON.stringify(first)).not.toContain(otherChild)
    const saved = await createCreditBooking(parentId, request(p.id))
    expect((await readCreditBookingOptions(parentId, p.id)).services[0].availableCredits).toBe(1)
    await applyBookingAction(saved.id, { id: parentId, role: 'PARENT' }, { action: 'cancel' })
    expect((await readCreditBookingOptions(parentId, p.id)).services[0].availableCredits).toBe(2)
  })
  it.each(['other-parent', 'trainer', 'deleted-parent'])('does not return booking options to %s', async role => {
    const p = await purchase()
    if (role === 'deleted-parent') await prisma.user.update({ where: { id: parentId }, data: { deletedAt: new Date() } })
    await expect(readCreditBookingOptions(role === 'other-parent' ? otherId : role === 'trainer' ? trainerId : parentId, p.id)).rejects.toMatchObject({ status: role === 'other-parent' ? 404 : 403 })
  })
  it.each(['review', 'expired', 'service-retired', 'missing-receipt'])('does not label %s credits as spendable', async state => {
    const p = await purchase({ paidAt: new Date(Date.now() - (state === 'expired' ? 91 * 86400000 : 1000)), receipt: state !== 'missing-receipt' })
    if (state === 'review') await prisma.packagePurchase.update({ where: { id: p.id }, data: { financialReview: { detail: 'private-provider-review' } } })
    if (state === 'service-retired') await prisma.serviceOffering.update({ where: { id: serviceId }, data: { isActive: false } })
    const result = creditBookingOptions.parse(await readCreditBookingOptions(parentId, p.id))
    expect(result.services[0].availableCredits).toBe(0)
    expect(result.services[0].hold).toBeTruthy()
    expect(JSON.stringify(result)).not.toContain('private-provider-review')
  })
  it('enforces shared cash/credit group capacity and rejects overlapping nonmatching sessions', async () => {
    await prisma.serviceOffering.update({ where: { id: serviceId }, data: { type: 'GROUP', maxParticipants: 2 } })
    const p = await purchase({ sessions: 3, type: 'GROUP' }), body = request(p.id)
    const third = await prisma.athleteProfile.create({ data: { parentProfileId, firstName: 'Three', lastName: 'Synthetic', dateOfBirth: new Date('2015-01-01'), sports: { create: { sportId } } } })
    expect((await post(body)).status).toBe(201)
    expect((await post({ ...body, requestId: randomUUID(), athleteProfileId: children[1], startTime: '09:30' })).status).toBe(409)
    const { purchaseId: _purchaseId, ...cash } = body
    await createBooking(parentId, { ...cash, requestId: randomUUID(), athleteProfileId: children[1], expectedTotalInCents: 3000 })
    expect((await post({ ...body, requestId: randomUUID(), athleteProfileId: third.id })).status).toBe(409)
    expect(await independent.booking.count()).toBe(2)
    expect(await independent.packageCreditRedemption.count()).toBe(1)
  })
  it('books siblings atomically through authenticated HTTP without another payment', async () => {
    const p = await purchase(), first = request(p.id)
    for (const body of [first, { ...first, requestId: randomUUID(), athleteProfileId: children[1], startTime: '10:00' }]) {
      const response = await post(body)
      expect(response.status).toBe(201)
      expect(response.headers.get('cache-control')).toBe('private, no-store')
      const result = await response.json()
      expect(result).toMatchObject({ status: 'CONFIRMED', creditFunding: { purchaseId: p.id, hold: null, restoredAt: null } })
      expect(Object.keys(result).sort()).toEqual(['creditFunding', 'id', 'status'])
      expect(JSON.stringify(result)).not.toContain(p.stripePaymentIntentId!)
      expect(await independent.booking.findUnique({ where: { id: result.id } })).toMatchObject({ athleteProfileId: body.athleteProfileId, totalAmountInCents: 0 })
    }
    expect(await independent.packageCreditRedemption.count({ where: { purchaseId: p.id, restoredAt: null } })).toBe(2)
    expect(await independent.bookingCreateRequest.count()).toBe(2)
    expect(await independent.notification.count()).toBe(4)
    expect(await independent.payment.count()).toBe(0)
    expect(await independent.walletEntry.count()).toBe(0)
    expect((await post({ ...first, requestId: randomUUID(), startTime: '11:00' })).status).toBe(409)
  })
  it('returns one saved booking for simultaneous identical retries', async () => {
    const p = await purchase({ sessions: 1 }), body = request(p.id)
    const results = await Promise.all([post(body), post(body)])
    expect(results.map(result => result.status)).toEqual([201, 201])
    expect((await results[0].json()).id).toBe((await results[1].json()).id)
    expect(await independent.booking.count()).toBe(1)
    expect(await independent.packageCreditRedemption.count()).toBe(1)
    expect(await independent.bookingCreateRequest.count()).toBe(1)
    expect(await independent.notification.count()).toBe(2)
  })
  it('serializes different sibling reservations for the last credit', async () => {
    const p = await purchase({ sessions: 1 }), body = request(p.id)
    const results = await Promise.all([post(body), post({ ...body, requestId: randomUUID(), athleteProfileId: children[1], startTime: '10:00' })])
    expect(results.map(result => result.status).sort()).toEqual([201, 409])
    expect(await independent.booking.count()).toBe(1)
    expect(await independent.packageCreditRedemption.count()).toBe(1)
    expect(await independent.notification.count()).toBe(2)
  })
  it.each(['notes', 'startTime', 'athleteProfileId', 'purchaseId'])('rejects changed %s under a committed request', async field => {
    const p = await purchase(), body = request(p.id)
    expect((await post(body)).status).toBe(201)
    const changed = field === 'purchaseId' ? (await purchase()).id : field === 'athleteProfileId' ? children[1] : field === 'startTime' ? '10:00' : 'Changed'
    expect((await post({ ...body, [field]: changed })).status).toBe(409)
    expect(await independent.booking.count()).toBe(1)
    expect(await independent.packageCreditRedemption.count()).toBe(1)
  })
  it('replays cancellation history after eligibility changes without reserving or spending again', async () => {
    const p = await purchase(), body = request(p.id), saved = await createCreditBooking(parentId, body)
    await applyBookingAction(saved.id, { id: parentId, role: 'PARENT' }, { action: 'cancel' })
    await prisma.serviceOffering.update({ where: { id: serviceId }, data: { isActive: false } })
    const replay = await createCreditBooking(parentId, body)
    expect(replay).toMatchObject({ id: saved.id, status: 'CANCELLED', creditFunding: { restoredAt: expect.any(String) } })
    expect(await independent.packageCreditRedemption.count()).toBe(1)
    expect(await independent.booking.count()).toBe(1)
  })
  it('does not resurrect a deleted saved booking', async () => {
    const p = await purchase(), body = request(p.id), saved = await createCreditBooking(parentId, body)
    await prisma.booking.delete({ where: { id: saved.id } })
    expect((await post(body)).status).toBe(409)
    expect(await independent.booking.count()).toBe(0)
  })
  it.each(['cash-first', 'credit-first'])('does not reuse the request identity between cash and credit: %s', async order => {
    const p = await purchase(), body = request(p.id), { purchaseId: _purchaseId, ...cash } = body
    if (order === 'cash-first') {
      await createBooking(parentId, { ...cash, expectedTotalInCents: 3000 })
      expect((await post(body)).status).toBe(409)
      expect(await independent.packageCreditRedemption.count()).toBe(0)
    } else {
      await createCreditBooking(parentId, body)
      await expect(createBooking(parentId, { ...cash, expectedTotalInCents: 3000 })).rejects.toMatchObject({ status: 409 })
      expect(await independent.packageCreditRedemption.count()).toBe(1)
    }
    expect(await independent.booking.count()).toBe(1)
  })
  it.each(['couponCode', 'expectedTotalInCents', 'packageId', 'status', 'parentProfileId'])('rejects unsupported %s without reserving', async field => {
    const p = await purchase()
    expect((await post({ ...request(p.id), [field]: field === 'expectedTotalInCents' ? 0 : 'unsupported' })).status).toBe(400)
    await assertEmpty()
  })
  it.each(['anonymous', 'trainer', 'other-parent', 'other-child', 'deleted-parent'])('denies %s without a debit', async actor => {
    const p = await purchase(), body = request(p.id)
    if (actor === 'deleted-parent') await prisma.user.update({ where: { id: parentId }, data: { deletedAt: new Date() } })
    const result = await post({ ...body, ...(actor === 'other-child' ? { athleteProfileId: otherChild } : {}) }, actor === 'anonymous' ? null : actor === 'trainer' ? trainerId : actor === 'other-parent' ? otherId : parentId)
    expect(result.status).toBe(actor === 'trainer' ? 403 : actor === 'anonymous' || actor === 'deleted-parent' ? 401 : 404)
    await assertEmpty()
  })
  it.each(['review', 'refund', 'pending-refund', 'failed-refund', 'unverified', 'status', 'intent', 'charge', 'checkout', 'transfer'])('holds new reservations after %s changes', async reason => {
    const p = await purchase()
    const change: Prisma.PackagePurchaseUpdateInput = reason === 'review' ? { financialReview: { detail: 'private-provider-review' } } :
      reason === 'refund' ? { refundAmountInCents: 1 } : reason === 'pending-refund' ? { refundPendingAmountInCents: 1 } :
      reason === 'failed-refund' ? { refundFailedCount: 1 } : reason === 'unverified' ? { settlementVerifiedAt: null } :
      reason === 'status' ? { status: 'REFUNDED' } : reason === 'intent' ? { stripePaymentIntentId: 'pi_changed' } :
      reason === 'charge' ? { stripeChargeId: 'ch_changed' } : reason === 'checkout' ? { stripeCheckoutSessionId: 'cs_changed' } : { stripeTransferId: null }
    await prisma.packagePurchase.update({ where: { id: p.id }, data: change })
    const response = await post(request(p.id))
    expect(response.status).toBe(409)
    expect(JSON.stringify(await response.json())).not.toContain('private-provider-review')
    await assertEmpty()
  })
  it.each(['expired', 'session-after-expiry', 'missing-receipt', 'legacy-policy'])('rejects %s', async state => {
    const p = await purchase({ paidAt: new Date(Date.now() - (state === 'expired' ? 91 : state === 'session-after-expiry' ? 89 : 0) * 86400000 - 1000),
      receipt: state !== 'missing-receipt', version: state === 'legacy-policy' ? 1 : 2 })
    expect((await post(request(p.id))).status).toBe(409)
    await assertEmpty()
  })
  it.each([false, 0, ''])('treats a non-null falsy JSON review %j as a hold before attempting a debit', async review => {
    const p = await purchase()
    await prisma.packagePurchase.update({ where: { id: p.id }, data: { financialReview: review } })
    const options = await readCreditBookingOptions(parentId, p.id)
    expect(options.services[0].availableCredits).toBe(0)
    expect((await post(request(p.id))).status).toBe(409)
    await assertEmpty()
  })
  it.each(['inactive-service', 'duration', 'type', 'trainer-inactive', 'trainer-deleted', 'sport-inactive', 'child-sport', 'time-zone', 'unavailable'])('revalidates %s', async state => {
    const p = await purchase()
    if (state === 'inactive-service') await prisma.serviceOffering.update({ where: { id: serviceId }, data: { isActive: false } })
    if (state === 'duration') await prisma.serviceOffering.update({ where: { id: serviceId }, data: { durationMinutes: 90 } })
    if (state === 'type') await prisma.serviceOffering.update({ where: { id: serviceId }, data: { type: 'GROUP' } })
    if (state === 'trainer-inactive') await prisma.trainerProfile.update({ where: { id: trainerProfileId }, data: { isActive: false } })
    if (state === 'trainer-deleted') await prisma.user.update({ where: { id: trainerId }, data: { deletedAt: new Date() } })
    if (state === 'sport-inactive') await prisma.sport.update({ where: { id: sportId }, data: { isActive: false } })
    if (state === 'child-sport') await prisma.athleteSport.deleteMany({ where: { athleteProfileId: children[0] } })
    if (state === 'time-zone') await prisma.trainerProfile.update({ where: { id: trainerProfileId }, data: { timeZone: 'America/New_York' } })
    if (state === 'unavailable') await prisma.availabilitySlot.deleteMany({ where: { trainerProfileId } })
    expect((await post(request(p.id))).status).toBe(['child-sport', 'unavailable'].includes(state) ? 400 : 409)
    await assertEmpty()
  })
  it('does not reprice prepaid credit when current cash pricing changes', async () => {
    const p = await purchase()
    await prisma.serviceOffering.update({ where: { id: serviceId }, data: { priceInCents: 99900 } })
    expect((await post(request(p.id))).status).toBe(201)
    expect((await independent.booking.findFirstOrThrow()).totalAmountInCents).toBe(0)
    expect(await independent.payment.count()).toBe(0)
  })
  it('serializes competing cash and credit sessions using the shared trainer lock', async () => {
    const p = await purchase(), body = request(p.id), { purchaseId: _id, ...cash } = body
    const results = await Promise.allSettled([createCreditBooking(parentId, body), createBooking(parentId, {
      ...cash, requestId: randomUUID(), athleteProfileId: children[1], expectedTotalInCents: 3000,
    })])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
    expect(await independent.booking.count()).toBe(1)
  })
  it('permits a restored credit to book again under a new request without reopening the cancelled session', async () => {
    const p = await purchase({ sessions: 1 }), body = request(p.id), first = await createCreditBooking(parentId, body)
    await applyBookingAction(first.id, { id: parentId, role: 'PARENT' }, { action: 'cancel' })
    const second = await createCreditBooking(parentId, { ...body, requestId: randomUUID(), athleteProfileId: children[1] })
    expect(second.id).not.toBe(first.id)
    expect(await independent.packageCreditRedemption.count({ where: { restoredAt: null } })).toBe(1)
    expect((await independent.booking.findUniqueOrThrow({ where: { id: first.id } })).status).toBe('CANCELLED')
  })
  it('rolls back the booking, debit and notices if the request record cannot commit', async () => {
    const p = await purchase(), body = request(p.id)
    await prisma.$executeRawUnsafe('ALTER TABLE booking_create_requests ADD CONSTRAINT credit_request_test_failure CHECK (false) NOT VALID')
    try {
      expect((await post(body)).status).toBe(503)
      await assertEmpty()
    } finally { await prisma.$executeRawUnsafe('ALTER TABLE booking_create_requests DROP CONSTRAINT credit_request_test_failure') }
    expect((await post(body)).status).toBe(201)
    expect(await independent.packageCreditRedemption.count()).toBe(1)
  })
})

describe('role-scoped credit funding dashboard', () => {
  it.each(['PARENT', 'TRAINER'] as const)('returns a safe %s funding snapshot without a second payment', async role => {
    const p = await purchase(), b = await booking()
    await spend(p.id, b.id)
    const result = await readDashboardBookings({ id: role === 'PARENT' ? parentId : trainerId, role }, role === 'PARENT' ? 'upcoming' : 'confirmed', 1, 10)
    const payload = dashboardResponseSchema.parse(JSON.parse(JSON.stringify(result)))
    expect(payload.bookings[0].creditFunding).toEqual({ kind: 'PACKAGE_CREDIT', purchaseId: p.id, packageTitle: 'Shared sessions', restoredAt: null, hold: null })
    expect(payload.bookings[0].payment).toBeNull()
    expect(result.bookings[0]).not.toHaveProperty('creditRedemption')
    expect(result.bookings[0]).not.toHaveProperty('parentProfileId')
    expect(result.bookings[0]).not.toHaveProperty('platformFeeInCents')
    expect(JSON.stringify(result)).not.toContain(p.stripePaymentIntentId!)
    expect(JSON.stringify(result)).not.toContain(p.stripeTransferId!)
  })
  it('does not expose another parent\'s purchased funding', async () => {
    const p = await purchase(), b = await booking()
    await spend(p.id, b.id)
    const result = await readDashboardBookings({ id: otherId, role: 'PARENT' }, 'upcoming', 1, 10)
    expect(result.bookings).toEqual([])
    expect(JSON.stringify(result)).not.toContain(p.id)
  })
  it.each(['early', 'late'])('shows the saved %s cancellation result after independent reload', async timing => {
    const p = await purchase(), b = await booking({ startsAt: new Date(Date.now() + (timing === 'early' ? 3 * 86400000 : 3600000)) })
    await spend(p.id, b.id)
    await applyBookingAction(b.id, { id: parentId, role: 'PARENT' }, { action: 'cancel' })
    const result = await readDashboardBookings({ id: parentId, role: 'PARENT' }, 'past', 1, 10)
    const ledger = await independent.packageCreditRedemption.findUniqueOrThrow({ where: { bookingId: b.id } })
    expect(result.bookings[0].creditFunding?.restoredAt).toBe(ledger.restoredAt?.toISOString() ?? null)
    expect(!!result.bookings[0].creditFunding?.restoredAt).toBe(timing === 'early')
    expect(result.bookings[0].creditFunding?.hold).toBeNull()
  })
  it.each(['review', 'refund', 'pending-refund', 'failed-refund', 'unverified'])('projects a generic %s hold on both participant dashboards', async mode => {
    const p = await purchase(), b = await booking()
    await spend(p.id, b.id)
    const change = mode === 'review' ? { financialReview: { detail: 'private-provider-review' } } : mode === 'refund' ? { refundAmountInCents: 1 } :
      mode === 'pending-refund' ? { refundPendingAmountInCents: 1 } : mode === 'failed-refund' ? { refundFailedCount: 1 } : { settlementVerifiedAt: null }
    await prisma.packagePurchase.update({ where: { id: p.id }, data: change })
    for (const role of ['PARENT', 'TRAINER'] as const) {
      const result = await readDashboardBookings({ id: role === 'PARENT' ? parentId : trainerId, role }, role === 'PARENT' ? 'upcoming' : 'confirmed', 1, 10)
      expect(result.bookings[0].creditFunding?.hold).toContain('reconciliation')
      expect(JSON.stringify(result)).not.toContain('private-provider-review')
    }
  })
  it('uses the purchased package title rather than later catalog edits', async () => {
    const p = await purchase(), b = await booking()
    await spend(p.id, b.id)
    await prisma.package.update({ where: { id: packageId }, data: { title: 'A different package title' } })
    const result = await readDashboardBookings({ id: parentId, role: 'PARENT' }, 'upcoming', 1, 10)
    expect(result.bookings[0].creditFunding?.packageTitle).toBe('Shared sessions')
  })
})

describe('credit-funded booking actions', () => {
  it.each(['parent', 'trainer'])('atomically restores an early %s cancellation and retries without duplicate notices', async role => {
    const p = await purchase(), b = await booking()
    await spend(p.id, b.id)
    const actor = role === 'parent' ? { id: parentId, role: 'PARENT' } : { id: trainerId, role: 'TRAINER' }
    await applyBookingAction(b.id, actor, { action: 'cancel' })
    const saved = await independent.packageCreditRedemption.findUniqueOrThrow({ where: { bookingId: b.id } })
    expect(saved.restoredAt).toBeInstanceOf(Date)
    expect(saved.restoredByUserId).toBe(actor.id)
    expect((await independent.booking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe('CANCELLED')
    await applyBookingAction(b.id, actor, { action: 'cancel' })
    expect(await independent.packageCreditRedemption.findUnique({ where: { bookingId: b.id } })).toEqual(saved)
    expect(await independent.notification.count({ where: { userId: { in: [parentId, trainerId] } } })).toBe(2)
    expect(await independent.payment.count()).toBe(0)
  })
  it.each(['complete', 'no_show'] as const)('records %s using the package receipt without a second payment', async action => {
    const p = await purchase(), b = await booking()
    await spend(p.id, b.id)
    // Only the JS outcome clock advances; SQL issuance and restoration use real database time.
    vi.spyOn(Date, 'now').mockReturnValue(b.endsAt!.getTime() + 1)
    await applyBookingAction(b.id, { id: trainerId, role: 'TRAINER' }, { action })
    await applyBookingAction(b.id, { id: trainerId, role: 'TRAINER' }, { action })
    expect((await independent.booking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe(action === 'complete' ? 'COMPLETED' : 'NO_SHOW')
    expect((await independent.trainerProfile.findUniqueOrThrow({ where: { id: trainerProfileId } })).totalSessions).toBe(action === 'complete' ? 1 : 0)
    expect((await independent.packageCreditRedemption.findUniqueOrThrow({ where: { bookingId: b.id } })).restoredAt).toBeNull()
    expect(await independent.payment.count()).toBe(0)
    expect(await independent.walletEntry.count()).toBe(0)
    expect(await independent.notification.count({ where: { userId: parentId } })).toBe(1)
  })
  it.each(['parent', 'trainer'])('applies the correct late %s cancellation policy', async role => {
    const p = await purchase(), b = await booking({ startsAt: new Date(Date.now() + 3600000) })
    await spend(p.id, b.id)
    const actor = role === 'parent' ? { id: parentId, role: 'PARENT' } : { id: trainerId, role: 'TRAINER' }
    await applyBookingAction(b.id, actor, { action: 'cancel' })
    const credit = await independent.packageCreditRedemption.findUniqueOrThrow({ where: { bookingId: b.id } })
    expect(!!credit.restoredAt).toBe(role === 'trainer')
    const notice = await independent.notification.findFirstOrThrow({ where: { userId: parentId } })
    expect(notice.message).toContain(role === 'trainer' ? 'one session credit was returned' : 'session credit remains used')
    expect(notice.message).toContain('No cash refund was issued')
    // Another actor's retry must not reinterpret the committed cancellation.
    await applyBookingAction(b.id, { id: trainerId, role: 'TRAINER' }, { action: 'cancel' })
    expect(await independent.packageCreditRedemption.findUnique({ where: { bookingId: b.id } })).toEqual(credit)
  })
  it.each(['complete', 'no_show'] as const)('still rejects premature credit-funded %s', async action => {
    const p = await purchase(), b = await booking()
    await spend(p.id, b.id)
    await expect(applyBookingAction(b.id, { id: trainerId, role: 'TRAINER' }, { action })).rejects.toMatchObject({ status: 409 })
    expect((await independent.booking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe('CONFIRMED')
    expect(await independent.notification.count({ where: { userId: parentId } })).toBe(0)
  })
  it.each(['complete', 'no_show'] as const)('does not permit a parent to record %s with prepaid credits', async action => {
    const p = await purchase(), b = await booking()
    await spend(p.id, b.id)
    vi.spyOn(Date, 'now').mockReturnValue(b.endsAt!.getTime() + 1)
    await expect(applyBookingAction(b.id, { id: parentId, role: 'PARENT' }, { action })).rejects.toMatchObject({ status: 403 })
  })
  it('rejects a different parent before cancelling or restoring credits', async () => {
    const p = await purchase(), b = await booking()
    await spend(p.id, b.id)
    await expect(applyBookingAction(b.id, { id: otherId, role: 'PARENT' }, { action: 'cancel' })).rejects.toMatchObject({ status: 403 })
    expect((await independent.booking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe('CONFIRMED')
    expect((await independent.packageCreditRedemption.findUniqueOrThrow({ where: { bookingId: b.id } })).restoredAt).toBeNull()
  })
  it('does not invent an admin cancellation/credit adjustment policy', async () => {
    const p = await purchase(), b = await booking()
    await spend(p.id, b.id)
    await prisma.user.update({ where: { id: otherId }, data: { role: 'ADMIN' } })
    await expect(applyBookingAction(b.id, { id: otherId, role: 'ADMIN' }, { action: 'cancel' })).rejects.toMatchObject({ status: 409 })
    expect((await independent.booking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe('CONFIRMED')
    expect(await independent.adminAction.count({ where: { adminUserId: otherId } })).toBe(0)
  })
  it.each(['review', 'refund', 'pending-refund', 'failed-refund', 'unverified', 'status', 'intent', 'charge', 'checkout', 'transfer'])('holds both outcomes after package %s changes', async reason => {
    const p = await purchase(), b = await booking()
    await spend(p.id, b.id)
    const change: Prisma.PackagePurchaseUpdateInput = reason === 'review' ? { financialReview: { reason: 'synthetic hold' } } :
      reason === 'refund' ? { refundAmountInCents: 1 } : reason === 'pending-refund' ? { refundPendingAmountInCents: 1 } :
      reason === 'failed-refund' ? { refundFailedCount: 1 } : reason === 'unverified' ? { settlementVerifiedAt: null } :
      reason === 'status' ? { status: 'REFUNDED' } : reason === 'intent' ? { stripePaymentIntentId: 'pi_changed' } :
      reason === 'charge' ? { stripeChargeId: 'ch_changed' } : reason === 'checkout' ? { stripeCheckoutSessionId: 'cs_changed' } : { stripeTransferId: null }
    await prisma.packagePurchase.update({ where: { id: p.id }, data: change })
    vi.spyOn(Date, 'now').mockReturnValue(b.endsAt!.getTime() + 1)
    for (const action of ['complete', 'no_show'] as const) {
      await expect(applyBookingAction(b.id, { id: trainerId, role: 'TRAINER' }, { action })).rejects.toMatchObject({ status: 409 })
    }
    expect((await independent.booking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe('CONFIRMED')
    expect((await independent.trainerProfile.findUniqueOrThrow({ where: { id: trainerProfileId } })).totalSessions).toBe(0)
    expect(await independent.notification.count({ where: { userId: parentId } })).toBe(0)
  })
  it('can cancel during review without clearing it or making the restored credit spendable', async () => {
    const p = await purchase(), b = await booking()
    await spend(p.id, b.id)
    await prisma.packagePurchase.update({ where: { id: p.id }, data: { financialReview: { reason: 'synthetic hold' } } })
    await applyBookingAction(b.id, { id: parentId, role: 'PARENT' }, { action: 'cancel' })
    expect((await independent.packageCreditRedemption.findUniqueOrThrow({ where: { bookingId: b.id } })).restoredAt).toBeInstanceOf(Date)
    expect((await independent.packagePurchase.findUniqueOrThrow({ where: { id: p.id } })).financialReview).toEqual({ reason: 'synthetic hold' })
    const replacement = await booking()
    await expect(spend(p.id, replacement.id)).rejects.toThrow('Verified clean payment')
  })
  it('permits recording a previously funded session after package expiry without extending validity', async () => {
    const p = await purchase(), b = await booking()
    await spend(p.id, b.id)
    const receipt = await independent.packagePaymentReceipt.findUniqueOrThrow({ where: { purchaseId: p.id } })
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 100 * 86400000)
    await applyBookingAction(b.id, { id: trainerId, role: 'TRAINER' }, { action: 'complete' })
    expect(await independent.packagePaymentReceipt.findUnique({ where: { purchaseId: p.id } })).toEqual(receipt)
  })
  it('serializes concurrent cancellations into one restoration and one set of notices', async () => {
    const p = await purchase(), b = await booking()
    await spend(p.id, b.id)
    await Promise.all([
      applyBookingAction(b.id, { id: parentId, role: 'PARENT' }, { action: 'cancel' }),
      applyBookingAction(b.id, { id: trainerId, role: 'TRAINER' }, { action: 'cancel' }),
    ])
    expect(await independent.packageCreditRedemption.count({ where: { purchaseId: p.id, restoredAt: { not: null } } })).toBe(1)
    expect(await independent.notification.count({ where: { userId: { in: [parentId, trainerId] } } })).toBe(2)
  })
  it('rolls back cancellation and restoration when notification persistence fails', async () => {
    const p = await purchase(), b = await booking()
    await spend(p.id, b.id)
    const transaction = prisma.$transaction.bind(prisma)
    vi.spyOn(prisma, '$transaction').mockImplementation(((run: (tx: Prisma.TransactionClient) => Promise<unknown>) => transaction(async tx => {
      const wrapped = new Proxy(tx, { get(target, key) {
        if (key === 'notification') return new Proxy(target.notification, { get(model, method) {
          return method === 'createMany' ? async () => { throw new Error('Synthetic notification failure') } : Reflect.get(model, method)
        } })
        return Reflect.get(target, key)
      } })
      return run(wrapped)
    })) as typeof prisma.$transaction)
    await expect(applyBookingAction(b.id, { id: parentId, role: 'PARENT' }, { action: 'cancel' })).rejects.toThrow('Synthetic notification failure')
    expect((await independent.booking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe('CONFIRMED')
    expect((await independent.packageCreditRedemption.findUniqueOrThrow({ where: { bookingId: b.id } })).restoredAt).toBeNull()
    expect(await independent.notification.count({ where: { userId: { in: [parentId, trainerId] } } })).toBe(0)
  })
})

describe('real SQL family credit consumption ledger', () => {
  it('shares two credits across siblings, survives independent reload and never creates money records', async () => {
    const p = await purchase(), a = await booking(), b = await booking({ athleteProfileId: children[1] })
    await spend(p.id, a.id); await spend(p.id, b.id)
    expect(await independent.packageCreditRedemption.count({ where: { purchaseId: p.id, restoredAt: null } })).toBe(2)
    const c = await booking()
    await expect(spend(p.id, c.id)).rejects.toThrow('No session credits remain')
    expect(await independent.payment.count()).toBe(0)
    expect(await independent.walletEntry.count()).toBe(0)
    expect(await independent.packagePaymentReceipt.count({ where: { purchaseId: p.id } })).toBe(1)
  })
  it('retries the same booking without consuming another credit, including concurrent retries', async () => {
    const p = await purchase({ sessions: 1 }), b = await booking()
    const saved = await spend(p.id, b.id)
    expect(await Promise.all([spend(p.id, b.id), spend(p.id, b.id)])).toEqual([saved, saved])
    expect(await independent.packageCreditRedemption.count({ where: { purchaseId: p.id } })).toBe(1)
  })
  it('does not reassign a booking to a different purchase on retry', async () => {
    const a = await purchase(), b = await purchase(), session = await booking()
    await spend(a.id, session.id)
    await expect(spend(b.id, session.id)).rejects.toThrow('already uses another package')
  })
  it.each(['ReadCommitted', 'RepeatableRead'] as const)('allows only one last-credit winner with %s transactions', async isolationLevel => {
    const p = await purchase({ sessions: 1 }), sessions = [await booking(), await booking({ athleteProfileId: children[1] })]
    let arrived = 0, release!: () => void
    const ready = new Promise<void>(resolve => { release = resolve })
    const outcomes = await Promise.allSettled(sessions.map(b => independent.$transaction(async tx => {
      await tx.packageCreditRedemption.count({ where: { purchaseId: p.id } })
      if (++arrived === 2) release()
      await ready
      return tx.packageCreditRedemption.create({ data: { purchaseId: p.id, bookingId: b.id, serviceOfferingId: serviceId } })
    }, { isolationLevel })))
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(await independent.packageCreditRedemption.count({ where: { purchaseId: p.id, restoredAt: null } })).toBe(1)
  })
  it('serializes a payment insertion racing a credit attachment into exactly one funding type', async () => {
    const p = await purchase(), b = await booking()
    const outcomes = await Promise.allSettled([rawSpend(p.id, b.id), prisma.payment.create({ data: paymentData(b.id) })])
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(await independent.payment.count({ where: { bookingId: b.id } }) + await independent.packageCreditRedemption.count({ where: { bookingId: b.id } })).toBe(1)
  })
  it.each(['other-parent', 'trainer'])('denies %s consumption in the server helper', async actor => {
    const p = await purchase(), b = await booking()
    await expect(spend(p.id, b.id, actor === 'trainer' ? trainerId : otherId)).rejects.toMatchObject({ status: 403 })
    expect(await independent.packageCreditRedemption.count({ where: { purchaseId: p.id } })).toBe(0)
  })
  it.each(['other-parent', 'other-child', 'cash-total', 'cash-fee', 'cash-payout', 'pending', 'cancelled', 'completed', 'no-show', 'legacy-package', 'legacy-number', 'payment'])('rejects %s booking funding at the SQL boundary', async mode => {
    const p = await purchase()
    const changes: Partial<Prisma.BookingUncheckedCreateInput> = mode === 'other-parent' ? { parentProfileId: otherProfileId, athleteProfileId: otherChild } :
      mode === 'other-child' ? { athleteProfileId: otherChild } : mode === 'cash-total' ? { totalAmountInCents: 1 } : mode === 'cash-fee' ? { platformFeeInCents: 1 } :
      mode === 'cash-payout' ? { trainerPayoutInCents: 1 } : mode === 'pending' ? { status: 'PENDING' } : mode === 'cancelled' ? { status: 'CANCELLED' } :
      mode === 'completed' ? { status: 'COMPLETED' } : mode === 'no-show' ? { status: 'NO_SHOW' } : mode === 'legacy-package' ? { packageId } : mode === 'legacy-number' ? { packageSessionNumber: 1 } : {}
    const b = await booking(changes)
    if (mode === 'payment') await prisma.payment.create({ data: paymentData(b.id) })
    await expect(rawSpend(p.id, b.id)).rejects.toThrow()
    expect(await independent.packageCreditRedemption.count({ where: { purchaseId: p.id } })).toBe(0)
  })
  it.each(['pending', 'processing', 'failed', 'refunded', 'partial', 'refund', 'pending-refund', 'failed-refund', 'review', 'unverified', 'missing-intent', 'missing-charge', 'missing-transfer'])('rejects %s purchase state without consuming anything', async mode => {
    const p = await purchase(), b = await booking()
    const change: Prisma.PackagePurchaseUpdateInput = mode === 'pending' ? { status: 'PENDING' } : mode === 'processing' ? { status: 'PROCESSING' } :
      mode === 'failed' ? { status: 'FAILED' } : mode === 'refunded' ? { status: 'REFUNDED' } : mode === 'partial' ? { status: 'PARTIALLY_REFUNDED' } :
      mode === 'refund' ? { refundAmountInCents: 1 } : mode === 'pending-refund' ? { refundPendingAmountInCents: 1 } : mode === 'failed-refund' ? { refundFailedCount: 1 } :
      mode === 'review' ? { financialReview: { reason: 'Synthetic review' } } : mode === 'unverified' ? { settlementVerifiedAt: null } :
      mode === 'missing-intent' ? { stripePaymentIntentId: null } : mode === 'missing-charge' ? { stripeChargeId: null } : { stripeTransferId: null }
    await prisma.packagePurchase.update({ where: { id: p.id }, data: change })
    await expect(rawSpend(p.id, b.id)).rejects.toThrow('Verified clean payment')
  })
  it.each(['legacy', 'missing-receipt', 'expired', 'future-payment', 'past-session', 'session-at-expiry', 'unknown-time'])('rejects %s validity', async mode => {
    const paidAt = mode === 'expired' ? new Date(Date.now() - 91 * 86400000) : mode === 'future-payment' ? new Date(Date.now() + 60000) : new Date(Date.now() - 1000)
    const p = await purchase({ paidAt, version: mode === 'legacy' ? 1 : 2, receipt: mode !== 'missing-receipt' })
    const b = await booking(mode === 'past-session' ? { startsAt: new Date(Date.now() - 3600000) } :
      mode === 'session-at-expiry' ? { startsAt: new Date(paidAt.getTime() + 90 * 86400000) } : mode === 'unknown-time' ? { startsAt: null, endsAt: null, timeZone: null } : {})
    await expect(rawSpend(p.id, b.id)).rejects.toThrow()
  })
  it.each(['inactive-service', 'duration', 'type', 'sport', 'inactive-sport', 'athlete-sport', 'trainer-sport', 'inactive-trainer', 'unapproved-trainer', 'parent-role', 'trainer-role', 'parent-deleted', 'trainer-deleted'])('rejects changed %s eligibility', async mode => {
    const p = await purchase(), b = await booking()
    if (mode === 'inactive-service') await prisma.serviceOffering.update({ where: { id: serviceId }, data: { isActive: false } })
    if (mode === 'duration') await prisma.serviceOffering.update({ where: { id: serviceId }, data: { durationMinutes: 90 } })
    if (mode === 'type') await prisma.serviceOffering.update({ where: { id: serviceId }, data: { type: 'GROUP' } })
    if (mode === 'sport') await prisma.serviceOffering.update({ where: { id: serviceId }, data: { sportId: null } })
    if (mode === 'inactive-sport') await prisma.sport.update({ where: { id: sportId }, data: { isActive: false } })
    if (mode === 'athlete-sport') await prisma.athleteSport.deleteMany({ where: { athleteProfileId: children[0] } })
    if (mode === 'trainer-sport') await prisma.trainerSport.deleteMany({ where: { trainerProfileId } })
    if (mode === 'inactive-trainer') await prisma.trainerProfile.update({ where: { id: trainerProfileId }, data: { isActive: false } })
    if (mode === 'unapproved-trainer') await prisma.trainerProfile.update({ where: { id: trainerProfileId }, data: { approvalStatus: 'PENDING' } })
    if (mode === 'parent-role' || mode === 'trainer-role') await prisma.user.update({ where: { id: mode === 'parent-role' ? parentId : trainerId }, data: { role: 'ADMIN' } })
    if (mode === 'parent-deleted' || mode === 'trainer-deleted') await prisma.user.update({ where: { id: mode === 'parent-deleted' ? parentId : trainerId }, data: { deletedAt: new Date() } })
    await expect(rawSpend(p.id, b.id)).rejects.toThrow()
  })
  it('honors purchased credits after a current service price change', async () => {
    const p = await purchase(), b = await booking()
    await prisma.serviceOffering.update({ where: { id: serviceId }, data: { priceInCents: 999999 } })
    await expect(spend(p.id, b.id)).resolves.toMatchObject({ purchaseId: p.id, bookingId: b.id })
  })
  it.each(['stripePaymentIntentId', 'stripeChargeId', 'stripeCheckoutSessionId'] as const)('rejects a purchase whose %s no longer matches its immutable receipt', async field => {
    const p = await purchase(), b = await booking()
    await prisma.packagePurchase.update({ where: { id: p.id }, data: { [field]: 'provider_identity_changed' } })
    await expect(rawSpend(p.id, b.id)).rejects.toThrow('Verified unexpired credits')
    expect(await independent.packageCreditRedemption.count({ where: { purchaseId: p.id } })).toBe(0)
  })
  it('rolls back a credit spend when the surrounding booking transaction fails', async () => {
    const p = await purchase({ sessions: 1 }), b = await booking()
    await expect(prisma.$transaction(async tx => {
      await redeemPackageCredit(tx, parentId, p.id, b.id)
      throw new Error('Synthetic booking transaction failure')
    })).rejects.toThrow('Synthetic booking transaction failure')
    expect(await independent.packageCreditRedemption.count({ where: { purchaseId: p.id } })).toBe(0)
    await expect(spend(p.id, b.id)).resolves.toMatchObject({ purchaseId: p.id })
  })
  it('restores an early parent cancellation once and allows the other sibling to spend it', async () => {
    const p = await purchase({ sessions: 1 }), a = await booking(), b = await booking({ athleteProfileId: children[1] })
    await spend(p.id, a.id); await cancel(a.id)
    const saved = await restore(a.id)
    expect(saved).toMatchObject({ restoredByUserId: parentId, restorationReason: 'EARLY_PARENT_CANCELLATION', restoredAt: expect.any(Date) })
    expect(await Promise.all([restore(a.id), restore(a.id)])).toEqual([saved, saved])
    await spend(p.id, b.id)
    expect(await independent.packageCreditRedemption.count({ where: { purchaseId: p.id } })).toBe(2)
    expect(await independent.packageCreditRedemption.count({ where: { purchaseId: p.id, restoredAt: null } })).toBe(1)
    expect(await spend(p.id, a.id)).toEqual(saved)
  })
  it('consumes a late parent cancellation without inventing a refund', async () => {
    const p = await purchase({ sessions: 1 }), a = await booking({ startsAt: new Date(Date.now() + 3600000) }), b = await booking()
    await spend(p.id, a.id); await cancel(a.id)
    expect(await restore(a.id)).toMatchObject({ restoredAt: null, restorationReason: null })
    await expect(spend(p.id, b.id)).rejects.toThrow('No session credits remain')
    expect(await independent.packageRefund.count({ where: { purchaseId: p.id } })).toBe(0)
  })
  it('restores a trainer cancellation inside 24h without extending receipt-based expiry', async () => {
    const p = await purchase(), b = await booking({ startsAt: new Date(Date.now() + 3600000) })
    const receipt = await independent.packagePaymentReceipt.findUniqueOrThrow({ where: { purchaseId: p.id } })
    await spend(p.id, b.id); await cancel(b.id)
    expect(await restore(b.id, { id: trainerId, role: 'TRAINER' })).toMatchObject({ restoredByUserId: trainerId, restorationReason: 'TRAINER_CANCELLATION' })
    expect(await independent.packagePaymentReceipt.findUniqueOrThrow({ where: { purchaseId: p.id } })).toEqual(receipt)
  })
  it.each(['CONFIRMED', 'COMPLETED', 'NO_SHOW'] as const)('does not restore a %s session', async status => {
    const p = await purchase(), b = await booking()
    await spend(p.id, b.id)
    await prisma.booking.update({ where: { id: b.id }, data: { status } })
    await expect(restore(b.id)).rejects.toThrow('Only a cancelled booking')
  })
  it.each(['outsider', 'admin', 'spoofed-role'])('refuses %s restoration authority', async mode => {
    const p = await purchase(), b = await booking()
    await spend(p.id, b.id); await cancel(b.id)
    await expect(restore(b.id, { id: mode === 'outsider' ? otherId : parentId, role: mode === 'admin' ? 'ADMIN' : mode === 'spoofed-role' ? 'TRAINER' : 'PARENT' })).rejects.toMatchObject({ status: 403 })
  })
  it.each(['purchase', 'service', 'booking', 'time', 'delete', 'restored-insert', 'forged-early', 'forged-trainer', 'unknown-reason'])('protects %s consumption evidence against direct writes', async mode => {
    const p = await purchase(), b = await booking({ startsAt: new Date(Date.now() + 3600000) })
    const saved = await spend(p.id, b.id)
    if (['forged-early', 'forged-trainer', 'unknown-reason'].includes(mode)) await cancel(b.id)
    let operation: Promise<unknown>
    if (mode === 'delete') operation = independent.packageCreditRedemption.delete({ where: { bookingId: b.id } })
    else if (mode === 'restored-insert') {
      const other = await booking()
      operation = independent.packageCreditRedemption.create({ data: { purchaseId: p.id, bookingId: other.id, serviceOfferingId: serviceId,
        restoredAt: new Date(), restoredByUserId: parentId, restorationReason: 'EARLY_PARENT_CANCELLATION' } })
    } else {
      const data: Prisma.PackageCreditRedemptionUncheckedUpdateInput = mode === 'purchase' ? { purchaseId: (await purchase()).id } :
        mode === 'service' ? { serviceOfferingId: 'unrelated' } : mode === 'booking' ? { bookingId: (await booking()).id } : mode === 'time' ? { redeemedAt: new Date(0) } :
        { restoredAt: new Date(0), restoredByUserId: mode === 'forged-trainer' ? otherId : parentId,
          restorationReason: mode === 'forged-trainer' ? 'TRAINER_CANCELLATION' : mode === 'unknown-reason' ? 'ADMIN_OVERRIDE' : 'EARLY_PARENT_CANCELLATION' }
      operation = independent.packageCreditRedemption.update({ where: { bookingId: b.id }, data })
    }
    await expect(operation).rejects.toThrow()
    expect(await independent.packageCreditRedemption.findUnique({ where: { bookingId: b.id } })).toEqual(saved)
  })
  it('does not allow restored history to be rewritten or a cancelled booking to reopen', async () => {
    const p = await purchase(), b = await booking()
    await spend(p.id, b.id); await cancel(b.id); await restore(b.id)
    await expect(independent.packageCreditRedemption.update({ where: { bookingId: b.id }, data: { restoredAt: null, restoredByUserId: null, restorationReason: null } })).rejects.toThrow()
    await expect(independent.booking.update({ where: { id: b.id }, data: { status: 'CONFIRMED' } })).rejects.toThrow('cannot be reopened')
  })
  it.each(['parent', 'child', 'service', 'total', 'fee', 'payout', 'pending', 'reschedule', 'payment'])('prevents %s changes after credit funding', async mode => {
    const p = await purchase(), b = await booking()
    await spend(p.id, b.id)
    if (mode === 'payment') await expect(independent.payment.create({ data: paymentData(b.id) })).rejects.toThrow('cannot also have a booking payment')
    else {
      const data: Prisma.BookingUncheckedUpdateInput = mode === 'parent' ? { parentProfileId: otherProfileId } : mode === 'child' ? { athleteProfileId: children[1] } :
        mode === 'service' ? { serviceOfferingId: 'unrelated' } : mode === 'total' ? { totalAmountInCents: 1 } : mode === 'fee' ? { platformFeeInCents: 1 } :
        mode === 'payout' ? { trainerPayoutInCents: 1 } : mode === 'pending' ? { status: 'PENDING' } : { status: 'RESCHEDULED' }
      await expect(independent.booking.update({ where: { id: b.id }, data })).rejects.toThrow()
    }
  })
  it('does not erase consumed grant evidence by deleting the purchase', async () => {
    const p = await purchase(), b = await booking()
    await spend(p.id, b.id)
    await expect(independent.packagePurchase.delete({ where: { id: p.id } })).rejects.toThrow()
    expect(await independent.packageCreditRedemption.count({ where: { bookingId: b.id } })).toBe(1)
  })
})
