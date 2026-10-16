import { randomUUID } from 'node:crypto'
import Stripe from 'stripe'
import { Prisma, PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { preparePackagePurchase } from '@/lib/package-purchases'
import { startOrResumePackageCheckout } from '@/lib/package-checkout'
import { reconcilePackageCheckout } from '@/lib/package-settlement'
import { reconcileRefundEvent } from '@/lib/refund-reconciliation'
import { readPackageHistory, refreshPackageHistory } from '@/lib/package-history'
import { packageHistoryResponse } from '@/lib/package-history-schema'
import { NextRequest } from 'next/server'
import { encode } from 'next-auth/jwt'
import { POST as checkoutPOST } from '@/app/api/package-purchases/checkout/route'
import { GET as reviewGET } from '@/app/api/package-purchases/review/route'
import { packageReviewResponse } from '@/lib/package-sales-schema'
import { rateLimit, rateLimitKey } from '@/lib/rate-limit'
import { POST as creditPOST } from '@/app/api/bookings/credits/route'
import { readCreditBookingOptions } from '@/lib/credit-booking-options'
import { applyBookingAction } from '@/lib/booking-actions'
import { POST } from '@/app/api/payments/webhook/route'
import { settlementFixture, settlementDispute } from '../helpers/stripe-settlement-fixture'

const provider = vi.hoisted(() => ({ create: vi.fn(), retrieve: vi.fn(), expire: vi.fn(), account: vi.fn(), intent: vi.fn(), charge: vi.fn(),
  transfer: vi.fn(), fee: vi.fn(), disputes: vi.fn(), refunds: vi.fn(), signature: '', secretConfigured: true, webhookConfigured: true }))
const secret = 'whsec_synthetic_package_checkout'
const authSecret = 'local-package-sales-only-not-a-real-secret'
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'stripe-signature': provider.signature }) }))
vi.mock('@/lib/stripe', async () => {
  const { default: SDK } = await import('stripe')
  return { stripeRuntimeStatus: () => ({ secretConfigured: provider.secretConfigured, webhookConfigured: provider.webhookConfigured }),
    verifyWebhookSignature: (body: string, signature: string) => SDK.webhooks.constructEvent(body, signature, 'whsec_synthetic_package_checkout'),
    stripe: { accounts: { retrieve: provider.account }, checkout: { sessions: { create: provider.create, retrieve: provider.retrieve, expire: provider.expire } },
      paymentIntents: { retrieve: provider.intent }, charges: { retrieve: provider.charge }, transfers: { retrieve: provider.transfer },
      applicationFees: { retrieve: provider.fee }, disputes: { list: provider.disputes }, refunds: { list: provider.refunds } } }
})
const independent = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL })
let parentId: string, trainerId: string, trainerProfileId: string, sportId: string, purchaseId: string
let verified = false, sessions = new Map<string, any>(), f: any
let refunds: any[] = []
let historyUsers: string[] = []
function refundReceipt(changes: Record<string, unknown> = {}) {
  return { id: 're_package', charge: f.charge.id, payment_intent: f.intent.id, amount: 1000, currency: 'usd',
    status: 'succeeded', created: 1791749000, transfer_reversal: null, source_transfer_reversal: null,
    failure_balance_transaction: null, failure_reason: null, ...changes }
}
const readPurchase = () => independent.packagePurchase.findUniqueOrThrow({ where: { id: purchaseId } })
const readAttempt = () => independent.packageCheckoutAttempt.findFirstOrThrow({ where: { purchaseId }, orderBy: { sequence: 'desc' } })
function createSession(parameters: any) {
  const id = `cs_${parameters.metadata.packageCheckoutAttemptId.replaceAll('-', '')}`
  if (!sessions.has(id)) sessions.set(id, { id, mode: 'payment', status: 'open', payment_status: 'unpaid', payment_intent: null,
    currency: 'usd', amount_total: 6000, livemode: false, metadata: structuredClone(parameters.metadata), expires_at: parameters.expires_at,
    url: `https://checkout.stripe.com/c/pay/${id}` })
  return structuredClone(sessions.get(id))
}
async function paidSession() {
  await startOrResumePackageCheckout(purchaseId, parentId)
  const attempt = await readAttempt(), session = sessions.get(attempt.stripeCheckoutSessionId!)
  f.intent.metadata = f.charge.metadata = structuredClone(session.metadata)
  Object.assign(session, { status: 'complete', payment_status: 'paid', payment_intent: f.intent.id, url: null })
  return { session, attempt }
}
async function webhook(session: any, type = 'checkout.session.completed', account?: string, validSignature = true) {
  const body = JSON.stringify({ id: `evt_${randomUUID()}`, type, ...(account ? { account } : {}), data: { object: session } })
  provider.signature = validSignature ? Stripe.webhooks.generateTestHeaderString({ payload: body, secret }) : 'invalid'
  return POST(new Request('http://localhost/api/payments/webhook', { method: 'POST', body }) as any)
}
async function successWebhook(changes: Record<string, unknown> = {}, intentChanges: Record<string, unknown> = {}, validSignature = true) {
  const event = { id: `evt_${randomUUID().replaceAll('-', '')}`, created: Math.floor(Date.now() / 1000), livemode: false,
    type: 'payment_intent.succeeded', data: { object: { ...structuredClone(f.intent), ...intentChanges } }, ...changes }
  const body = JSON.stringify(event)
  provider.signature = validSignature ? Stripe.webhooks.generateTestHeaderString({ payload: body, secret }) : 'invalid'
  return POST(new Request('http://localhost/api/payments/webhook', { method: 'POST', body }) as any)
}
beforeAll(async () => {
  vi.stubEnv('NEXTAUTH_SECRET', authSecret)
  expect(await prisma.$queryRaw`SELECT purpose FROM trainr_test_guard`).toEqual([{ purpose: 'disposable integration database' }])
  expect(await prisma.$queryRaw`SELECT current_database() AS name`).toEqual([{ name: expect.stringMatching(/^trainr_audit_/) }])
  verified = true
})
beforeEach(async () => {
  vi.resetAllMocks(); sessions = new Map(); f = settlementFixture(); refunds = []; historyUsers = []
  provider.secretConfigured = true; provider.webhookConfigured = true
  const key = randomUUID()
  const sport = await prisma.sport.create({ data: { name: key, slug: key } }); sportId = sport.id
  const trainer = await prisma.user.create({ data: { email: `package-checkout-trainer-${key}@example.test`, passwordHash: 'not-a-login', role: 'TRAINER',
    trainerProfile: { create: { firstName: 'Synthetic', lastName: 'Trainer', slug: key, approvalStatus: 'APPROVED', stripeAccountId: 'acct_settlement', stripeOnboardingComplete: true, timeZone: 'UTC',
      sports: { create: { sportId } }, serviceOfferings: { create: { title: 'Training', sportId, priceInCents: 3000 } } } } },
    include: { trainerProfile: { include: { serviceOfferings: true } } } })
  trainerId = trainer.id; trainerProfileId = trainer.trainerProfile!.id
  const parent = await prisma.user.create({ data: { email: `package-checkout-parent-${key}@example.test`, passwordHash: 'not-a-login', role: 'PARENT', parentProfile: { create: {} } } })
  parentId = parent.id
  const catalog = await prisma.package.create({ data: { trainerProfileId, title: 'Two sessions', totalSessions: 2, priceInCents: 6000, validForDays: 90,
    items: { create: { serviceOfferingId: trainer.trainerProfile!.serviceOfferings[0].id, sessionsCount: 2 } } } })
  const purchase = await preparePackagePurchase(parentId, { requestId: randomUUID(), packageId: catalog.id, catalogRevision: catalog.updatedAt.toISOString(), expectedTotalInCents: 6000 })
  purchaseId = purchase.id
  provider.account.mockResolvedValue({ id: 'acct_settlement', details_submitted: true, charges_enabled: true, payouts_enabled: true, capabilities: { transfers: 'active' } })
  provider.create.mockImplementation(async parameters => createSession(parameters))
  provider.retrieve.mockImplementation(async id => structuredClone(sessions.get(id)))
  provider.expire.mockImplementation(async id => { const session = sessions.get(id); session.status = 'expired'; return structuredClone(session) })
  for (const name of ['intent', 'charge', 'transfer', 'fee'] as const) provider[name].mockImplementation(async () => structuredClone(f[name]))
  provider.disputes.mockImplementation(async () => ({ data: structuredClone(f.disputes), has_more: false }))
  provider.refunds.mockImplementation(async () => ({ data: structuredClone(refunds), has_more: false }))
})
afterEach(async () => {
  if (!verified) return
  await prisma.rateLimitBucket.deleteMany({ where: { keyHash: { in: [parentId, trainerId, ...historyUsers].map(id => rateLimitKey(`package-checkout:${id}`, 5, 60000)) } } })
  await prisma.booking.deleteMany({ where: { trainerProfileId } })
  await prisma.packagePurchase.deleteMany({ where: { trainerProfileId } })
  await prisma.user.deleteMany({ where: { id: { in: [parentId, trainerId, ...historyUsers] } } })
  await prisma.sport.delete({ where: { id: sportId } })
})
afterAll(async () => { vi.unstubAllEnvs(); await prisma.$disconnect(); await independent.$disconnect() })

describe('public package checkout route with local SQL and simulated provider', () => {
  async function review(query: string, userId: string | null = parentId) {
    const user = userId ? await prisma.user.findUniqueOrThrow({ where: { id: userId } }) : null
    const token = user ? await encode({ secret: authSecret, token: { sub: user.id, role: user.role, sessionVersion: user.sessionVersion } }) : null
    return reviewGET(new NextRequest(`http://localhost/api/package-purchases/review?${query}`, { headers: token ? { cookie: `next-auth.session-token=${token}` } : {} }))
  }
  async function post(body: unknown, userId: string | null = parentId, raw = false) {
    const user = userId ? await prisma.user.findUniqueOrThrow({ where: { id: userId } }) : null
    const token = user ? await encode({ secret: authSecret, token: { sub: user.id, role: user.role, sessionVersion: user.sessionVersion } }) : null
    return checkoutPOST(new NextRequest('http://localhost/api/package-purchases/checkout', { method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { cookie: `next-auth.session-token=${token}` } : {}) },
      body: raw ? String(body) : JSON.stringify(body) }))
  }
  async function request() {
    const purchase = await readPurchase()
    return { requestId: purchase.requestId, packageId: purchase.packageId, catalogRevision: purchase.catalogRevision.toISOString(), expectedTotalInCents: purchase.amountInCents }
  }
  async function noProvider() {
    expect(provider.account).not.toHaveBeenCalled(); expect(provider.create).not.toHaveBeenCalled()
    expect(await independent.packageCheckoutAttempt.count({ where: { purchaseId } })).toBe(0)
  }
  it('reads a safe current offer without creating purchase or checkout records', async () => {
    const saved = await readPurchase(), response = await review(`packageId=${saved.packageId}`)
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store')
    const data = packageReviewResponse.parse(await response.json())
    expect(data).toMatchObject({ buyerId: parentId, packageId: saved.packageId, purchaseId: null, catalogRevision: saved.catalogRevision.toISOString(),
      amountInCents: 6000, canCheckout: true, canBuyAgain: false, terms: { version: 2, totalSessions: 2 } })
    expect(JSON.stringify(data)).not.toContain('acct_settlement'); expect(JSON.stringify(data)).not.toContain('example.test')
    expect(await readPurchase()).toEqual(saved); expect(await independent.packagePurchase.count()).toBe(1)
    await noProvider()
  })
  it('holds both an existing pending purchase and a new offer when Connect becomes restricted', async () => {
    const saved = await readPurchase()
    await prisma.trainerProfile.update({ where: { id: trainerProfileId }, data: { stripeOnboardingComplete: false } })
    for (const query of [`purchaseId=${purchaseId}`, `packageId=${saved.packageId}`]) {
      const response = await review(query)
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ canCheckout: false, hold: expect.stringContaining('Stripe setup') })
    }
    await noProvider()
  })
  it('recovers a stale saved Connect flag through the fresh provider checkout check', async () => {
    await prisma.trainerProfile.update({ where: { id: trainerProfileId }, data: { stripeOnboardingComplete: false } })
    expect(await (await review(`purchaseId=${purchaseId}`)).json()).toMatchObject({ canCheckout: false, hold: expect.stringContaining('Stripe setup') })
    const response = await post(await request())
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ purchaseId, checkoutUrl: expect.stringMatching(/^https:\/\/checkout\.stripe\.com\//) })
    expect(provider.account).toHaveBeenCalled()
    expect((await prisma.trainerProfile.findUniqueOrThrow({ where: { id: trainerProfileId } })).stripeOnboardingComplete).toBe(true)
  })
  it('recovers the original owned purchase by request identity across reloads', async () => {
    const saved = await readPurchase()
    const response = await review(`packageId=${saved.packageId}&requestId=${saved.requestId}`)
    expect(response.status).toBe(200)
    expect(packageReviewResponse.parse(await response.json())).toMatchObject({ buyerId: parentId, purchaseId, status: 'PENDING', amountInCents: 6000, canCheckout: true })
    expect(await (await review(`purchaseId=${purchaseId}`)).json()).toMatchObject({ purchaseId, amountInCents: 6000 })
    await noProvider()
  })
  it('preserves bought terms and disables checkout after the catalog changes', async () => {
    const saved = await readPurchase()
    await prisma.package.update({ where: { id: saved.packageId }, data: { title: 'Changed offer', priceInCents: 7000 } })
    const old = await (await review(`purchaseId=${purchaseId}`)).json()
    expect(old).toMatchObject({ amountInCents: 6000, terms: { title: 'Two sessions' }, canCheckout: false })
    const current = await (await review(`packageId=${saved.packageId}`)).json()
    expect(current).toMatchObject({ amountInCents: 7000, terms: { title: 'Changed offer' }, canCheckout: true })
    const existing = await post(await request())
    expect(existing.status).toBe(409); expect(await existing.json()).not.toHaveProperty('code')
    const fresh = await post({ ...await request(), requestId: randomUUID() })
    expect(fresh.status).toBe(409); expect(await fresh.json()).toMatchObject({ code: 'OFFER_CHANGED' })
    await noProvider()
  })
  it.each([false, 0, '', Prisma.JsonNull])('review does not expose checkout for financial review %j', async financialReview => {
    await prisma.packagePurchase.update({ where: { id: purchaseId }, data: { financialReview } })
    const response = await review(`purchaseId=${purchaseId}`)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ canCheckout: false, canBuyAgain: false, hold: expect.any(String) })
    await noProvider()
  })
  it.each([false, 0, '', Prisma.JsonNull])('history retains a SQL-non-null review flag %j', async financialReview => {
    await prisma.packagePurchase.update({ where: { id: purchaseId }, data: { financialReview } })
    for (const actor of [{ id: parentId, role: 'PARENT' }, { id: trainerId, role: 'TRAINER' }]) {
      const history = packageHistoryResponse.parse(await readPackageHistory(actor, { view: 'review', page: 1, limit: 10 }))
      expect(history.pagination.total).toBe(1)
      expect(history.purchases[0]).toMatchObject({ id: purchaseId, reviewRequired: true })
    }
  })
  it.each(['anonymous', 'trainer', 'admin', 'deleted', 'foreign'])('denies %s review access', async mode => {
    let actor: string | null = mode === 'anonymous' ? null : mode === 'trainer' ? trainerId : parentId
    if (mode === 'admin') await prisma.user.update({ where: { id: parentId }, data: { role: 'ADMIN' } })
    if (mode === 'deleted') await prisma.user.update({ where: { id: parentId }, data: { deletedAt: new Date() } })
    if (mode === 'foreign') {
      const other = await prisma.user.create({ data: { email: `review-${randomUUID()}@example.test`, passwordHash: 'not-a-login', role: 'PARENT', parentProfile: { create: {} } } })
      historyUsers.push(other.id); actor = other.id
    }
    expect((await review(`purchaseId=${purchaseId}`, actor)).status).toBe(mode === 'anonymous' || mode === 'deleted' ? 401 : mode === 'foreign' ? 404 : 403)
    await noProvider()
  })
  it.each(['', 'packageId=x&purchaseId=y', 'packageId=x&packageId=y', 'packageId=x&requestId=no', 'purchaseId=x&extra=y'])('rejects malformed review query %s', async query => {
    expect((await review(query)).status).toBe(400); await noProvider()
  })
  it.each(['trainer', 'package', 'service', 'sport'])('rejects unavailable %s offers before purchase', async mode => {
    const saved = await readPurchase()
    if (mode === 'trainer') await prisma.trainerProfile.update({ where: { id: trainerProfileId }, data: { isActive: false } })
    if (mode === 'package') await prisma.package.update({ where: { id: saved.packageId }, data: { isActive: false } })
    if (mode === 'service') await prisma.serviceOffering.updateMany({ where: { trainerProfileId }, data: { isActive: false } })
    if (mode === 'sport') await prisma.sport.update({ where: { id: sportId }, data: { isActive: false } })
    expect((await review(`packageId=${saved.packageId}`)).status).toBe(409)
    await noProvider()
  })
  it('does not let a foreign request identity reveal or resume another parent purchase', async () => {
    const saved = await readPurchase()
    const other = await prisma.user.create({ data: { email: `review-foreign-${randomUUID()}@example.test`, passwordHash: 'not-a-login', role: 'PARENT', parentProfile: { create: {} } } })
    historyUsers.push(other.id)
    const response = await review(`packageId=${saved.packageId}&requestId=${saved.requestId}`, other.id)
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ buyerId: other.id, purchaseId: null })
    await noProvider()
  })
  it('allows an explicit repeat purchase only after verified success with no holds', async () => {
    const { session } = await paidSession(); await webhook(session); await successWebhook()
    expect(await (await review(`purchaseId=${purchaseId}`)).json()).toMatchObject({ canCheckout: false, canBuyAgain: true, status: 'SUCCEEDED' })
    await prisma.packagePurchase.update({ where: { id: purchaseId }, data: { financialReview: Prisma.JsonNull } })
    expect(await (await review(`purchaseId=${purchaseId}`)).json()).toMatchObject({ canCheckout: false, canBuyAgain: false })
  })
  it('blocks purchase when the trainer has no usable schedule time zone', async () => {
    await prisma.trainerProfile.update({ where: { id: trainerProfileId }, data: { timeZone: null } })
    await expect(startOrResumePackageCheckout(purchaseId, parentId)).rejects.toThrow('time zone')
    await noProvider()
  })
  it('creates a reviewed purchase and returns only an unpaid owned checkout; retries and resume reuse it', async () => {
    const input = { ...await request(), requestId: randomUUID() }
    const response = await post(input), result = await response.json()
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(Object.keys(result).sort()).toEqual(['checkoutUrl', 'purchaseId'])
    expect(result.purchaseId).not.toBe(purchaseId)
    expect(result.checkoutUrl).toMatch(/^https:\/\/checkout.stripe.com\//)
    expect(await (await post(input)).json()).toEqual(result)
    expect(await (await post({ purchaseId: result.purchaseId })).json()).toEqual(result)
    expect(await independent.packagePurchase.count({ where: { parentProfile: { userId: parentId } } })).toBe(2)
    expect(await independent.packageCheckoutAttempt.count({ where: { purchaseId: result.purchaseId } })).toBe(1)
    expect(provider.create).toHaveBeenCalledTimes(1)
    expect((await independent.packagePurchase.findUniqueOrThrow({ where: { id: result.purchaseId } })).status).toBe('PENDING')
    expect(await independent.packageCreditGrant.count()).toBe(0)
    expect(await independent.booking.count()).toBe(0); expect(await independent.payment.count()).toBe(0); expect(await independent.walletEntry.count()).toBe(0)
  })
  it('recovers a lost provider response with exactly the same purchase and durable Stripe key', async () => {
    const input = await request()
    provider.create.mockImplementationOnce(async parameters => { createSession(parameters); throw new Error('provider secret detail') })
    const failed = await post(input)
    expect(failed.status).toBe(503); expect(await failed.text()).not.toContain('provider secret detail')
    expect((await post(input)).status).toBe(200)
    expect(provider.create.mock.calls[1]).toEqual(provider.create.mock.calls[0])
    expect(sessions.size).toBe(1)
    expect(await independent.packagePurchase.count({ where: { trainerProfileId } })).toBe(1)
    expect(await independent.packageCheckoutAttempt.count({ where: { purchaseId } })).toBe(1)
  })
  it('serializes concurrent initial submissions through the same purchase and checkout attempt', async () => {
    const input = { ...await request(), requestId: randomUUID() }
    const responses = await Promise.all([post(input), post(input)])
    expect(responses.map(response => response.status)).toEqual([200, 200])
    expect(await responses[0].json()).toEqual(await responses[1].json())
    expect(sessions.size).toBe(1)
    expect(await independent.packagePurchase.count({ where: { trainerProfileId } })).toBe(2)
    expect(await independent.packageCheckoutAttempt.count()).toBe(1)
  })
  it.each(['anonymous', 'trainer', 'admin', 'foreign', 'deleted', 'role-changed'])('denies %s without provider access', async mode => {
    let actor: string | null = parentId
    if (mode === 'anonymous') actor = null
    if (mode === 'trainer') actor = trainerId
    if (mode === 'admin') await prisma.user.update({ where: { id: parentId }, data: { role: 'ADMIN' } })
    if (mode === 'role-changed') await prisma.user.update({ where: { id: parentId }, data: { role: 'TRAINER' } })
    if (mode === 'deleted') await prisma.user.update({ where: { id: parentId }, data: { deletedAt: new Date() } })
    if (mode === 'foreign') {
      const other = await prisma.user.create({ data: { email: `foreign-${randomUUID()}@example.test`, passwordHash: 'not-a-login', role: 'PARENT', parentProfile: { create: {} } } })
      historyUsers.push(other.id); actor = other.id
    }
    const response = await post({ purchaseId }, actor)
    expect(response.status).toBe(mode === 'anonymous' || mode === 'deleted' ? 401 : mode === 'foreign' ? 404 : 403)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    await noProvider()
  })
  it.each(['malformed', 'unknown-field', 'mixed', 'amount', 'changed-request', 'stale-price', 'missing-purchase'])('rejects %s requests before provider access', async mode => {
    let input: unknown = await request()
    if (mode === 'malformed') input = '{'
    if (mode === 'unknown-field') input = { ...await request(), parentId: 'other' }
    if (mode === 'mixed') input = { ...await request(), purchaseId }
    if (mode === 'amount') input = { ...await request(), expectedTotalInCents: 0 }
    if (mode === 'changed-request') input = { ...await request(), expectedTotalInCents: 6500 }
    if (mode === 'stale-price') input = { ...await request(), requestId: randomUUID(), expectedTotalInCents: 6500 }
    if (mode === 'missing-purchase') input = { purchaseId: 'nonexistent' }
    const response = await post(input, parentId, mode === 'malformed')
    expect(response.status).toBe(mode === 'missing-purchase' ? 404 : ['changed-request', 'stale-price'].includes(mode) ? 409 : 400)
    await noProvider()
    expect(await independent.packagePurchase.count({ where: { trainerProfileId } })).toBe(1)
  })
  it.each(['secretConfigured', 'webhookConfigured'] as const)('fails closed without %s', async field => {
    provider[field] = false
    expect((await post({ ...await request(), requestId: randomUUID() })).status).toBe(503)
    await noProvider()
    expect(await independent.packagePurchase.count({ where: { trainerProfileId } })).toBe(1)
  })
  it('rate limits before purchase creation or provider access', async () => {
    for (let i = 0; i < 5; i++) expect((await rateLimit(`package-checkout:${parentId}`, 5, 60000)).allowed).toBe(true)
    const response = await post({ ...await request(), requestId: randomUUID() })
    expect(response.status).toBe(429); expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0)
    await noProvider()
    expect(await independent.packagePurchase.count({ where: { trainerProfileId } })).toBe(1)
  })
  it('does not release a paid checkout or create another attempt when payment completes before retry', async () => {
    const { session } = await paidSession()
    expect((await post({ purchaseId })).status).toBe(409)
    expect(await independent.packageCheckoutAttempt.count({ where: { purchaseId } })).toBe(1)
    expect(provider.create).toHaveBeenCalledTimes(1)
    expect((await readPurchase()).stripeCheckoutSessionId).toBe(session.id)
  })
  it('fails closed when the durable rate limit cannot persist', async () => {
    const failure = vi.spyOn(prisma, '$executeRaw').mockRejectedValueOnce(new Error('private persistence details'))
    try {
      const response = await post({ ...await request(), requestId: randomUUID() })
      expect(response.status).toBe(503); expect(await response.text()).not.toContain('private persistence details')
      await noProvider()
      expect(await independent.packagePurchase.count({ where: { trainerProfileId } })).toBe(1)
    } finally { failure.mockRestore() }
  })
  it('requires current credit policy before charging legacy purchases', async () => {
    const current = await readPurchase(), terms = current.terms as any
    const { creditPolicy: _policy, ...legacy } = terms
    const old = await prisma.packagePurchase.create({ data: { parentProfileId: current.parentProfileId, trainerProfileId, packageId: current.packageId,
      requestId: randomUUID(), payloadHash: current.payloadHash, catalogRevision: current.catalogRevision, terms: { ...legacy, version: 1 },
      amountInCents: current.amountInCents, platformFeeInCents: current.platformFeeInCents, trainerPayoutInCents: current.trainerPayoutInCents } })
    const response = await post({ purchaseId: old.id })
    expect(response.status).toBe(409); expect((await response.json()).error).toContain('Legacy')
    await noProvider()
  })
  it('joins checkout, signed synthetic payment, sibling reservations and cancellation without a second charge', async () => {
    const checkout = await post(await request())
    expect(checkout.status).toBe(200)
    const result = await checkout.json(), attempt = await readAttempt(), session = sessions.get(attempt.stripeCheckoutSessionId!)
    expect(result.purchaseId).toBe(purchaseId)
    expect(await independent.packageCreditGrant.count()).toBe(0)
    f.intent.metadata = f.charge.metadata = structuredClone(session.metadata)
    Object.assign(session, { status: 'complete', payment_status: 'paid', payment_intent: f.intent.id, url: null })
    expect((await webhook(session)).status).toBe(200)
    expect(await independent.packagePaymentReceipt.count()).toBe(0)
    expect((await successWebhook()).status).toBe(200)
    const paid = await readPurchase()
    expect(paid).toMatchObject({ status: 'SUCCEEDED', stripeChargeId: f.charge.id, stripeTransferId: f.transfer.id })
    expect(await independent.packagePaymentReceipt.count()).toBe(1)
    expect(await independent.packageCreditGrant.findMany({ where: { purchaseId } })).toMatchObject([{ sessionsCount: 2 }])
    for (const actor of [{ id: parentId, role: 'PARENT' }, { id: trainerId, role: 'TRAINER' }]) {
      const history = packageHistoryResponse.parse(await readPackageHistory(actor, { view: 'all', page: 1, limit: 10 }))
      expect(history.purchases[0]).toMatchObject({ id: purchaseId, status: 'SUCCEEDED', creditsGranted: 2 })
    }
    await prisma.trainerProfile.update({ where: { id: trainerProfileId }, data: { timeZone: 'UTC' } })
    await prisma.availabilitySlot.createMany({ data: Array.from({ length: 7 }, (_, dayOfWeek) => ({ trainerProfileId, dayOfWeek, startTime: '08:00', endTime: '18:00' })) })
    const service = await prisma.serviceOffering.findFirstOrThrow({ where: { trainerProfileId } })
    const children = await Promise.all(['One', 'Two'].map(firstName => prisma.athleteProfile.create({ data: { parentProfileId: paid.parentProfileId,
      firstName, lastName: 'Synthetic', dateOfBirth: new Date('2015-01-01'), goals: [], sports: { create: { sportId } } } })))
    const actor = await prisma.user.findUniqueOrThrow({ where: { id: parentId } })
    const token = await encode({ secret: authSecret, token: { sub: parentId, role: 'PARENT', sessionVersion: actor.sessionVersion } })
    const reserve = (body: unknown) => creditPOST(new NextRequest('http://localhost/api/bookings/credits', { method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: `next-auth.session-token=${token}` }, body: JSON.stringify(body) }))
    const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
    const bookings: string[] = []
    for (const [i, child] of children.entries()) {
      const body = { requestId: randomUUID(), purchaseId, serviceOfferingId: service.id, athleteProfileId: child.id, date,
        startTime: i === 0 ? '09:00' : '11:00', timeZone: 'UTC' }
      const response = await reserve(body), saved = await response.json()
      expect(response.status).toBe(201); expect(saved.status).toBe('CONFIRMED')
      expect(await (await reserve(body)).json()).toEqual(saved)
      bookings.push(saved.id)
    }
    expect((await readCreditBookingOptions(parentId, purchaseId)).services[0].availableCredits).toBe(0)
    await applyBookingAction(bookings[0], { id: parentId, role: 'PARENT' }, { action: 'cancel' })
    expect((await readCreditBookingOptions(parentId, purchaseId)).services[0].availableCredits).toBe(1)
    expect((await independent.packageCreditRedemption.findUniqueOrThrow({ where: { bookingId: bookings[0] } })).restoredAt).not.toBeNull()
    expect(await independent.booking.count()).toBe(2)
    expect(await independent.payment.count()).toBe(0); expect(await independent.walletEntry.count()).toBe(0)
    expect(provider.create).toHaveBeenCalledTimes(1); expect(sessions.size).toBe(1)
  })
})

describe('package checkout with real SQL, signatures and simulated Stripe receipts', () => {
  it('anchors payment time only to a signed success event and preserves it across all replays', async () => {
    const { session, attempt } = await paidSession()
    await reconcilePackageCheckout(purchaseId, attempt.id, session.id)
    expect(await independent.packagePaymentReceipt.count({ where: { purchaseId } })).toBe(0)
    const created = Math.floor(Date.now() / 1000)
    expect((await successWebhook({ id: 'evt_success', created })).status).toBe(200)
    const receipt = await independent.packagePaymentReceipt.findUniqueOrThrow({ where: { purchaseId } })
    expect(receipt).toMatchObject({ stripeEventId: 'evt_success', stripePaymentIntentId: f.intent.id, stripeChargeId: f.charge.id,
      stripeCheckoutSessionId: session.id, livemode: false, paidAt: new Date(created * 1000) })
    expect((await successWebhook({ id: 'evt_success', created })).status).toBe(200)
    expect((await successWebhook({ id: 'evt_duplicate_object', created })).status).toBe(200)
    expect((await webhook(session, 'checkout.session.async_payment_succeeded')).status).toBe(200)
    await refreshPackageHistory({ id: parentId, role: 'PARENT' }, purchaseId)
    expect(await independent.packagePaymentReceipt.findUnique({ where: { purchaseId } })).toEqual(receipt)
    for (const actor of [{ id: parentId, role: 'PARENT' }, { id: trainerId, role: 'TRAINER' }]) {
      const history = packageHistoryResponse.parse(await readPackageHistory(actor, { view: 'all', page: 1, limit: 10 }))
      expect(history.purchases[0]).toMatchObject({ paymentSucceededAt: new Date(created * 1000).toISOString(),
        expiresAt: new Date(created * 1000 + 90 * 86400000).toISOString() })
      expect(JSON.stringify(history)).not.toContain('evt_success')
      expect(JSON.stringify(history)).not.toContain(f.intent.id)
    }
    expect(await independent.packageCreditGrant.count({ where: { purchaseId } })).toBe(1)
    expect(await independent.booking.count()).toBe(0)
    expect(await independent.payment.count()).toBe(0)
    expect(await independent.walletEntry.count()).toBe(0)
  })
  it('settles a package when the PaymentIntent success event arrives before the Checkout event', async () => {
    const { session } = await paidSession()
    expect((await successWebhook()).status).toBe(200)
    expect(await readPurchase()).toMatchObject({ status: 'SUCCEEDED', stripeTransferId: f.transfer.id })
    expect(await independent.packagePaymentReceipt.count({ where: { purchaseId } })).toBe(1)
    expect((await webhook(session)).status).toBe(200)
    expect(await independent.packagePaymentReceipt.count({ where: { purchaseId } })).toBe(1)
  })
  it('serializes concurrent success events without extending validity or issuing more credits', async () => {
    await paidSession()
    const event = { id: 'evt_concurrent', created: Math.floor(Date.now() / 1000) }
    const responses = await Promise.all([1, 2, 3].map(() => successWebhook(event)))
    expect(responses.map(response => response.status)).toEqual([200, 200, 200])
    expect(await independent.packagePaymentReceipt.count({ where: { purchaseId } })).toBe(1)
    expect(await independent.packageCreditGrant.count({ where: { purchaseId } })).toBe(1)
  })
  it.each(['past', 'future', 'missing', 'fractional', 'out-of-range', 'bad-id', 'mode'])('rejects %s success-event evidence without partial writes', async mode => {
    await paidSession()
    const changes = mode === 'past' ? { created: Math.floor(Date.now() / 1000) - 86400 } :
      mode === 'future' ? { created: Math.floor(Date.now() / 1000) + 3600 } :
      mode === 'missing' ? { created: undefined } : mode === 'fractional' ? { created: Date.now() / 1000 + 0.12345 } :
      mode === 'out-of-range' ? { created: Number.MAX_SAFE_INTEGER } : mode === 'bad-id' ? { id: '' } : { livemode: true }
    expect((await successWebhook(changes)).status).toBe(409)
    expect((await readPurchase()).status).toBe('PENDING')
    expect(await independent.packagePaymentReceipt.count({ where: { purchaseId } })).toBe(0)
    expect(await independent.packageCreditGrant.count({ where: { purchaseId } })).toBe(0)
  })
  it.each(['intent', 'charge', 'amount', 'currency', 'mode', 'status', 'mixed-metadata'])('rejects mismatched %s in a signed package success event', async mode => {
    await paidSession()
    const changes = mode === 'intent' ? { id: 'pi_unrelated' } : mode === 'charge' ? { latest_charge: 'ch_unrelated' } :
      mode === 'amount' ? { amount: 1, amount_received: 1 } : mode === 'currency' ? { currency: 'eur' } :
      mode === 'mode' ? { livemode: true } : mode === 'status' ? { status: 'processing' } :
      { metadata: { ...f.intent.metadata, bookingId: 'unrelated' } }
    expect((await successWebhook({}, changes)).status).toBe(409)
    expect(await independent.packagePaymentReceipt.count({ where: { purchaseId } })).toBe(0)
    expect((await readPurchase()).status).toBe('PENDING')
  })
  it('rejects an invalid signature and ignores connected-account or failed events', async () => {
    await paidSession()
    expect((await successWebhook({}, {}, false)).status).toBe(400)
    expect((await successWebhook({ account: 'acct_other' })).status).toBe(200)
    expect((await successWebhook({ type: 'payment_intent.payment_failed' })).status).toBe(200)
    expect(await independent.packagePaymentReceipt.count({ where: { purchaseId } })).toBe(0)
    expect((await readPurchase()).status).toBe('PENDING')
  })
  it('retries success events that arrive before local session attachment', async () => {
    provider.create.mockImplementationOnce(async parameters => { createSession(parameters); throw new Error('Synthetic lost create response') })
    await expect(startOrResumePackageCheckout(purchaseId, parentId)).rejects.toThrow()
    const attempt = await readAttempt(), session = [...sessions.values()][0]
    expect(attempt.stripeCheckoutSessionId).toBeNull()
    f.intent.metadata = f.charge.metadata = structuredClone(session.metadata)
    Object.assign(session, { status: 'complete', payment_status: 'paid', payment_intent: f.intent.id, url: null })
    expect((await successWebhook()).status).toBe(503)
    expect(await independent.packagePaymentReceipt.count({ where: { purchaseId } })).toBe(0)
    await prisma.packageCheckoutAttempt.update({ where: { id: attempt.id }, data: { stripeCheckoutSessionId: session.id } })
    expect((await successWebhook()).status).toBe(200)
  })
  it('never rewrites a saved timestamp from a conflicting signed success event', async () => {
    await paidSession()
    const created = Math.floor(Date.now() / 1000)
    expect((await successWebhook({ created })).status).toBe(200)
    const before = await independent.packagePaymentReceipt.findUniqueOrThrow({ where: { purchaseId } })
    expect((await successWebhook({ created: created + 1 })).status).toBe(409)
    expect(await independent.packagePaymentReceipt.findUnique({ where: { purchaseId } })).toEqual(before)
  })
  it('keeps paid-time evidence during financial review without granting usable credits', async () => {
    await paidSession()
    f.disputes = [settlementDispute(f)]
    expect((await successWebhook()).status).toBe(200)
    expect(await independent.packagePaymentReceipt.count({ where: { purchaseId } })).toBe(1)
    expect(await independent.packageCreditGrant.count({ where: { purchaseId } })).toBe(0)
    expect((await readPurchase()).financialReview).not.toBeNull()
  })
  it('rolls back the timestamp when independent provider verification fails', async () => {
    await paidSession()
    provider.transfer.mockRejectedValueOnce(new Error('Synthetic provider unavailable'))
    expect((await successWebhook()).status).toBe(503)
    expect(await independent.packagePaymentReceipt.count({ where: { purchaseId } })).toBe(0)
    expect((await readPurchase()).status).toBe('PENDING')
    expect((await successWebhook()).status).toBe(200)
  })
  it('protects receipt identity, time and retention at the database boundary', async () => {
    await paidSession()
    expect((await successWebhook()).status).toBe(200)
    const before = await independent.packagePaymentReceipt.findUniqueOrThrow({ where: { purchaseId } })
    for (const data of [{ paidAt: new Date() }, { stripeEventId: 'evt_rewrite' }, { livemode: true }]) {
      await expect(independent.packagePaymentReceipt.update({ where: { purchaseId }, data })).rejects.toThrow(/immutable/)
    }
    await expect(independent.packagePaymentReceipt.delete({ where: { purchaseId } })).rejects.toThrow(/cannot be deleted independently/)
    expect(await independent.packagePaymentReceipt.findUnique({ where: { purchaseId } })).toEqual(before)
  })
  it('rejects direct receipt insertion before independent settlement verification', async () => {
    await expect(independent.packagePaymentReceipt.create({ data: { purchaseId, stripeEventId: 'evt_unverified',
      stripePaymentIntentId: 'pi_unverified', stripeChargeId: 'ch_unverified', stripeCheckoutSessionId: 'cs_unverified',
      livemode: false, paidAt: new Date(Math.floor(Date.now() / 1000) * 1000) } })).rejects.toThrow(/must match the verified/)
    expect(await independent.packagePaymentReceipt.count({ where: { purchaseId } })).toBe(0)
  })
  it.each(['intent', 'charge', 'session', 'before-purchase', 'future', 'id'])('rejects mismatched %s direct receipt insertion in SQL', async mode => {
    const { session, attempt } = await paidSession()
    await reconcilePackageCheckout(purchaseId, attempt.id, session.id)
    const data: Prisma.PackagePaymentReceiptUncheckedCreateInput = { purchaseId, stripeEventId: 'evt_verified', stripePaymentIntentId: f.intent.id,
      stripeChargeId: f.charge.id, stripeCheckoutSessionId: session.id, livemode: false,
      paidAt: new Date(Math.floor(Date.now() / 1000) * 1000) }
    if (mode === 'intent') data.stripePaymentIntentId = 'pi_wrong'
    if (mode === 'charge') data.stripeChargeId = 'ch_wrong'
    if (mode === 'session') data.stripeCheckoutSessionId = 'cs_wrong'
    if (mode === 'before-purchase') data.paidAt = new Date('2001-01-01')
    if (mode === 'future') data.paidAt = new Date(Date.now() + 3600000)
    if (mode === 'id') data.stripeEventId = ''
    await expect(independent.packagePaymentReceipt.create({ data })).rejects.toThrow()
    expect(await independent.packagePaymentReceipt.count({ where: { purchaseId } })).toBe(0)
  })
  it.each(['PENDING', 'REVIEW'])('records paid receipts but grants no credits while reinstated checkout retirement is %s', async status => {
    const { session } = await paidSession()
    await prisma.accountCheckoutClosure.create({ data: { userId: trainerId, kind: 'PACKAGE', targetId: purchaseId, status } })
    expect((await webhook(session)).status).toBe(200)
    expect(await readPurchase()).toMatchObject({ status: 'SUCCEEDED', stripeTransferId: f.transfer.id,
      financialReview: { details: { fulfillmentReview: ['checkout_retirement_pending'] } } })
    expect(await independent.packageCreditGrant.count({ where: { purchaseId } })).toBe(0)
  })
  it('issues family-owned service credits exactly once across concurrent receipt replays', async () => {
    const { session, attempt } = await paidSession()
    expect(await independent.packageCreditGrant.count()).toBe(0)
    const parent = await prisma.parentProfile.findUniqueOrThrow({ where: { userId: parentId } })
    for (const firstName of ['First', 'Second']) await prisma.athleteProfile.create({ data: { parentProfileId: parent.id, firstName, lastName: 'Synthetic', dateOfBirth: new Date('2015-01-01') } })
    await Promise.all([1, 2, 3].map(() => reconcilePackageCheckout(purchaseId, attempt.id, session.id)))
    const grants = await independent.packageCreditGrant.findMany({ where: { purchaseId } })
    expect(grants).toEqual([{ purchaseId, serviceOfferingId: expect.any(String), sessionsCount: 2, grantedAt: expect.any(Date) }])
    await reconcilePackageCheckout(purchaseId, attempt.id, session.id)
    expect(await independent.packageCreditGrant.findMany({ where: { purchaseId } })).toEqual(grants)
    for (const actor of [{ id: parentId, role: 'PARENT' }, { id: trainerId, role: 'TRAINER' }]) {
      expect((await readPackageHistory(actor, { view: 'all', page: 1, limit: 10 })).purchases[0].creditsGranted).toBe(2)
    }
    expect(await independent.booking.count()).toBe(0); expect(await independent.walletEntry.count()).toBe(0)
  })
  it('preserves per-service quantities from a mixed package instead of creating one interchangeable balance', async () => {
    const service = await prisma.serviceOffering.findFirstOrThrow({ where: { trainerProfileId } })
    const second = await prisma.serviceOffering.create({ data: { trainerProfileId, sportId, title: 'Second service', priceInCents: 2000, durationMinutes: 30 } })
    const catalog = await prisma.package.create({ data: { trainerProfileId, title: 'Mixed services', totalSessions: 3, priceInCents: 6000,
      items: { create: [{ serviceOfferingId: service.id, sessionsCount: 2 }, { serviceOfferingId: second.id, sessionsCount: 1 }] } } })
    const purchase = await preparePackagePurchase(parentId, { requestId: randomUUID(), packageId: catalog.id, catalogRevision: catalog.updatedAt.toISOString(), expectedTotalInCents: 6000 })
    purchaseId = purchase.id
    const { session } = await paidSession(); expect((await webhook(session)).status).toBe(200)
    const grants = await independent.packageCreditGrant.findMany({ where: { purchaseId } })
    expect(grants).toHaveLength(2)
    expect(grants).toEqual(expect.arrayContaining([
      expect.objectContaining({ serviceOfferingId: service.id, sessionsCount: 2 }),
      expect.objectContaining({ serviceOfferingId: second.id, sessionsCount: 1 }),
    ]))
    expect((await readPackageHistory({ id: parentId, role: 'PARENT' }, { view: 'all', page: 1, limit: 10 })).purchases.find(row => row.id === purchaseId)?.creditsGranted).toBe(3)
  })
  it.each(['parent-deleted', 'parent-role', 'trainer-deleted', 'trainer-role', 'trainer-inactive', 'trainer-unapproved', 'service-inactive', 'service-changed', 'sport-inactive'])('holds credit issuance for %s after checkout was opened', async mode => {
    const { session } = await paidSession()
    if (mode === 'parent-deleted') await prisma.user.update({ where: { id: parentId }, data: { deletedAt: new Date() } })
    if (mode === 'parent-role') await prisma.user.update({ where: { id: parentId }, data: { role: 'TRAINER' } })
    if (mode === 'trainer-deleted') await prisma.user.update({ where: { id: trainerId }, data: { deletedAt: new Date() } })
    if (mode === 'trainer-role') await prisma.user.update({ where: { id: trainerId }, data: { role: 'PARENT' } })
    if (mode === 'trainer-inactive') await prisma.trainerProfile.update({ where: { id: trainerProfileId }, data: { isActive: false } })
    if (mode === 'trainer-unapproved') await prisma.trainerProfile.update({ where: { id: trainerProfileId }, data: { approvalStatus: 'PENDING' } })
    if (mode === 'service-inactive') await prisma.serviceOffering.updateMany({ where: { trainerProfileId }, data: { isActive: false } })
    if (mode === 'service-changed') await prisma.serviceOffering.updateMany({ where: { trainerProfileId }, data: { durationMinutes: 30 } })
    if (mode === 'sport-inactive') await prisma.sport.update({ where: { id: sportId }, data: { isActive: false } })
    expect((await webhook(session)).status).toBe(200)
    expect(await readPurchase()).toMatchObject({ status: 'SUCCEEDED', settlementVerifiedAt: expect.any(Date), financialReview: expect.objectContaining({ details: expect.objectContaining({ fulfillmentReview: expect.any(Array) }) }) })
    expect(await independent.packageCreditGrant.count()).toBe(0)
  })
  it.each(['dispute', 'reversal', 'fee-refund', 'pending-refund'])('does not issue credits for %s', async mode => {
    const { session, attempt } = await paidSession()
    if (mode === 'dispute') f.disputes = [settlementDispute(f)]
    if (mode === 'reversal') f.transfer.amount_reversed = 1000
    if (mode === 'fee-refund') f.fee.amount_refunded = 100
    if (mode === 'pending-refund') refunds = [refundReceipt({ status: 'pending' })]
    await reconcilePackageCheckout(purchaseId, attempt.id, session.id, undefined, { id: parentId, role: 'PARENT' })
    expect(await independent.packageCreditGrant.count()).toBe(0)
  })
  it('keeps immutable grants during later financial review and recovers without duplicate issuance', async () => {
    const { session, attempt } = await paidSession(); await reconcilePackageCheckout(purchaseId, attempt.id, session.id)
    const before = await independent.packageCreditGrant.findMany({ where: { purchaseId } })
    f.disputes = [settlementDispute(f)]
    await reconcilePackageCheckout(purchaseId, attempt.id, session.id)
    expect((await readPackageHistory({ id: parentId, role: 'PARENT' }, { view: 'all', page: 1, limit: 10 })).purchases[0]).toMatchObject({ creditsGranted: 2, reviewRequired: true })
    expect(await independent.packageCreditGrant.findMany({ where: { purchaseId } })).toEqual(before)
    f.disputes = []
    await reconcilePackageCheckout(purchaseId, attempt.id, session.id)
    expect(await independent.packageCreditGrant.findMany({ where: { purchaseId } })).toEqual(before)
  })
  it('rolls back issuance when current provider verification fails', async () => {
    const { session, attempt } = await paidSession(); provider.transfer.mockRejectedValue(new Error('Synthetic unavailable'))
    await expect(reconcilePackageCheckout(purchaseId, attempt.id, session.id)).rejects.toThrow()
    expect((await readPurchase()).status).toBe('PENDING'); expect(await independent.packageCreditGrant.count()).toBe(0)
  })
  it.each(['sport', 'service'])('holds %s eligibility through the receipt verification transaction', async kind => {
    const { session, attempt } = await paidSession()
    let release!: () => void, entered!: () => void
    const blocked = new Promise<void>(resolve => { release = resolve })
    const reading = new Promise<void>(resolve => { entered = resolve })
    provider.transfer.mockImplementation(async () => { entered(); await blocked; return structuredClone(f.transfer) })
    const settling = reconcilePackageCheckout(purchaseId, attempt.id, session.id)
    try {
      await reading
      await expect(independent.$transaction(async tx => {
        await tx.$executeRaw`SET LOCAL lock_timeout = '250ms'`
        if (kind === 'sport') await tx.sport.update({ where: { id: sportId }, data: { isActive: false } })
        else await tx.serviceOffering.updateMany({ where: { trainerProfileId }, data: { isActive: false } })
      })).rejects.toThrow(/lock timeout/)
    } finally { release(); await settling }
    expect(await independent.packageCreditGrant.count({ where: { purchaseId } })).toBe(1)
  })
  it('enforces immutable grant quantities and identity in SQL', async () => {
    const { session, attempt } = await paidSession(); await reconcilePackageCheckout(purchaseId, attempt.id, session.id)
    const grant = await independent.packageCreditGrant.findFirstOrThrow({ where: { purchaseId } })
    await expect(independent.packageCreditGrant.updateMany({ where: { purchaseId }, data: { sessionsCount: 3 } })).rejects.toThrow()
    await expect(independent.packageCreditGrant.deleteMany({ where: { purchaseId } })).rejects.toThrow()
    await expect(independent.packageCreditGrant.create({ data: { purchaseId, serviceOfferingId: 'unrelated', sessionsCount: 2 } })).rejects.toThrow()
    expect(await independent.packageCreditGrant.findMany({ where: { purchaseId } })).toEqual([grant])
  })
  it('does not infer credits from a legacy success label or an unverified insert', async () => {
    const purchase = await readPurchase(), item = (purchase.terms as any).items[0]
    await prisma.packagePurchase.update({ where: { id: purchaseId }, data: { status: 'SUCCEEDED' } })
    await expect(independent.packageCreditGrant.create({ data: { purchaseId, serviceOfferingId: item.serviceOfferingId, sessionsCount: 2 } })).rejects.toThrow()
    expect((await readPackageHistory({ id: parentId, role: 'PARENT' }, { view: 'all', page: 1, limit: 10 })).purchases[0].creditsGranted).toBe(0)
  })
  it.each(['PARENT', 'TRAINER'])('lists immutable scoped purchase history for %s without provider details', async role => {
    const { session } = await paidSession(); expect((await webhook(session)).status).toBe(200)
    const original = await readPurchase()
    await independent.package.update({ where: { id: original.packageId }, data: { title: 'Changed catalog title', priceInCents: 10000 } })
    const result = packageHistoryResponse.parse(await readPackageHistory({ id: role === 'PARENT' ? parentId : trainerId, role }, { view: 'all', page: 1, limit: 10 }))
    expect(result.purchases).toHaveLength(1)
    expect(result.purchases[0]).toMatchObject({ id: purchaseId, title: 'Two sessions', totalSessions: 2, amountInCents: 6000,
      trainerAllocationInCents: role === 'TRAINER' ? 5100 : null, status: 'SUCCEEDED', paymentVerified: true, canRefresh: true })
    for (const forbidden of ['stripeChargeId', 'stripePaymentIntentId', 'stripeAccountId', 'parameters', 'payloadHash', 'passwordHash', 'failureBalanceTransactionId']) expect(JSON.stringify(result)).not.toContain(forbidden)
    expect(await readPurchase()).toEqual(original)
  })
  it.each(['PARENT', 'TRAINER'])('hides another account purchase from %s list and refresh', async role => {
    await paidSession()
    const key = randomUUID()
    const user = await prisma.user.create({ data: { email: `history-${key}@example.test`, passwordHash: 'not-a-login', role: role as 'PARENT' | 'TRAINER',
      ...(role === 'PARENT' ? { parentProfile: { create: {} } } : { trainerProfile: { create: { firstName: 'Other', lastName: 'Trainer', slug: key } } }) } })
    historyUsers.push(user.id)
    const actor = { id: user.id, role }
    expect((await readPackageHistory(actor, { view: 'all', page: 1, limit: 10 })).purchases).toEqual([])
    provider.retrieve.mockClear()
    await expect(refreshPackageHistory(actor, purchaseId)).rejects.toMatchObject({ status: 404 })
    expect(provider.retrieve).not.toHaveBeenCalled()
  })
  it.each(['deleted', 'changed-role', 'unknown'])('rejects stale %s actor authority for history and refresh', async mode => {
    await paidSession()
    if (mode === 'deleted') await prisma.user.update({ where: { id: parentId }, data: { deletedAt: new Date() } })
    if (mode === 'changed-role') await prisma.user.update({ where: { id: parentId }, data: { role: 'TRAINER' } })
    const actor = { id: mode === 'unknown' ? 'missing-user' : parentId, role: 'PARENT' }
    await expect(readPackageHistory(actor, { view: 'all', page: 1, limit: 10 })).rejects.toMatchObject({ status: 403 })
    await expect(refreshPackageHistory(actor, purchaseId)).rejects.toMatchObject({ status: 403 })
  })
  it('enforces current authority again inside the settlement write transaction', async () => {
    const { session, attempt } = await paidSession()
    await prisma.user.update({ where: { id: parentId }, data: { deletedAt: new Date() } })
    await expect(reconcilePackageCheckout(purchaseId, attempt.id, session.id, undefined, { id: parentId, role: 'PARENT' })).rejects.toMatchObject({ status: 403 })
    expect(provider.intent).not.toHaveBeenCalled(); expect((await readPurchase()).status).toBe('PENDING')
  })
  it('paginates consistently and clamps an obsolete page without repeating records', async () => {
    const purchase = await readPurchase()
    for (let i = 0; i < 3; i++) await preparePackagePurchase(parentId, { requestId: randomUUID(), packageId: purchase.packageId,
      catalogRevision: purchase.catalogRevision.toISOString(), expectedTotalInCents: 6000 })
    const actor = { id: parentId, role: 'PARENT' }
    const first = await readPackageHistory(actor, { view: 'all', page: 1, limit: 2 }), last = await readPackageHistory(actor, { view: 'all', page: 100, limit: 2 })
    expect(first.pagination).toEqual({ page: 1, limit: 2, total: 4, totalPages: 2 }); expect(last.pagination.page).toBe(2)
    expect(new Set([...first.purchases, ...last.purchases].map(row => row.id)).size).toBe(4)
  })
  it.each(['pending', 'paid', 'refunded', 'review'] as const)('applies %s history filter within ownership', async view => {
    const data = view === 'paid' ? { status: 'SUCCEEDED' as const } : view === 'refunded' ? { status: 'PARTIALLY_REFUNDED' as const } :
      view === 'review' ? { refundFailedCount: 1 } : {}
    await prisma.packagePurchase.update({ where: { id: purchaseId }, data })
    expect((await readPackageHistory({ id: parentId, role: 'PARENT' }, { view, page: 1, limit: 10 })).purchases.map(row => row.id)).toEqual([purchaseId])
  })
  it.each([Prisma.DbNull, Prisma.JsonNull])('distinguishes absent SQL review from a stored JSON null hold', async financialReview => {
    await prisma.packagePurchase.update({ where: { id: purchaseId }, data: { financialReview } })
    const history = await readPackageHistory({ id: parentId, role: 'PARENT' }, { view: 'review', page: 1, limit: 10 })
    expect(history.purchases.map(row => row.id)).toEqual(financialReview === Prisma.DbNull ? [] : [purchaseId])
    expect((await readPackageHistory({ id: parentId, role: 'PARENT' }, { view: 'all', page: 1, limit: 10 })).purchases[0].reviewRequired).toBe(financialReview !== Prisma.DbNull)
  })
  it.each(['PARENT', 'TRAINER'])('recovers missed package payment and current refund history for %s without issuing money', async role => {
    await paidSession(); refunds = [refundReceipt({ status: 'pending' })]
    provider.create.mockClear(); provider.expire.mockClear()
    expect(await refreshPackageHistory({ id: role === 'PARENT' ? parentId : trainerId, role }, purchaseId)).toEqual({ refreshed: true, purchaseId })
    expect(await readPurchase()).toMatchObject({ status: 'SUCCEEDED', refundPendingAmountInCents: 1000,
      financialReview: { details: { packageRefunds: { pendingInCents: 1000 } } } })
    expect(provider.refunds).toHaveBeenCalledOnce(); expect(provider.create).not.toHaveBeenCalled(); expect(provider.expire).not.toHaveBeenCalled()
    expect(await prisma.booking.count()).toBe(0); expect(await prisma.walletEntry.count()).toBe(0)
  })
  it.each(['open', 'expired'])('refreshes verified unpaid %s checkout without fabricating payment', async status => {
    await startOrResumePackageCheckout(purchaseId, parentId)
    const attempt = await readAttempt(); sessions.get(attempt.stripeCheckoutSessionId!).status = status
    const previous = await readPurchase(); provider.create.mockClear(); provider.expire.mockClear()
    await refreshPackageHistory({ id: parentId, role: 'PARENT' }, purchaseId)
    expect(await readPurchase()).toEqual(previous); expect(provider.intent).not.toHaveBeenCalled()
    expect(provider.create).not.toHaveBeenCalled(); expect(provider.expire).not.toHaveBeenCalled()
  })
  for (const role of ['PARENT', 'TRAINER'] as const) for (const status of ['open', 'expired']) {
    it.each([Prisma.JsonNull, false, 0, '', { reason: 'synthetic review' }])(`package settlement held unpaid ${status} refresh rejects ${role} review %j`, async financialReview => {
      await startOrResumePackageCheckout(purchaseId, parentId)
      const attempt = await readAttempt(); sessions.get(attempt.stripeCheckoutSessionId!).status = status
      await prisma.packagePurchase.update({ where: { id: purchaseId }, data: { financialReview } })
      const before = await readPurchase()
      await expect(refreshPackageHistory({ id: role === 'PARENT' ? parentId : trainerId, role }, purchaseId)).rejects.toThrow('Package payment is not completed')
      expect(await readPurchase()).toEqual(before)
      expect(await independent.packageCreditGrant.count({ where: { purchaseId } })).toBe(0)
      expect(provider.intent).not.toHaveBeenCalled()
    })
  }
  for (const type of ['checkout.session.completed', 'payment_intent.succeeded', 'transfer.created', 'application_fee.created', 'charge.updated']) {
    async function deliverCurrentPayment(session: any) {
      if (type === 'payment_intent.succeeded') return successWebhook()
      const object = type === 'transfer.created' ? f.transfer : type === 'application_fee.created' ? f.fee : type === 'charge.updated' ? f.charge : session
      return webhook(object, type)
    }
    it.each(['pending', 'requires_action', 'failed', 'canceled', 'succeeded'])(`package settlement refund inventory on ${type} detects missed %s refund delivery`, async status => {
      const { session } = await paidSession()
      refunds = [refundReceipt({ status })]
      if (status === 'succeeded') f.charge.amount_refunded = 1000
      expect((await deliverCurrentPayment(session)).status).toBe(200)
      expect(provider.refunds).toHaveBeenCalledOnce()
      expect(await readPurchase()).toMatchObject({
        status: status === 'succeeded' ? 'PARTIALLY_REFUNDED' : 'SUCCEEDED',
        refundAmountInCents: status === 'succeeded' ? 1000 : 0,
        refundPendingAmountInCents: ['pending', 'requires_action'].includes(status) ? 1000 : 0,
        refundFailedCount: ['failed', 'canceled'].includes(status) ? 1 : 0,
        refundsVerifiedAt: expect.any(Date), financialReview: expect.any(Object),
      })
      expect(await independent.packageRefund.count({ where: { purchaseId } })).toBe(1)
      expect(await independent.packageCreditGrant.count({ where: { purchaseId } })).toBe(0)
    })
    it(`package settlement refund inventory on ${type} fails closed when refund history is unavailable`, async () => {
      const { session } = await paidSession(), before = await readPurchase()
      provider.refunds.mockRejectedValue(new Error('Synthetic refund history unavailable'))
      expect((await deliverCurrentPayment(session)).status).toBe(503)
      expect(await readPurchase()).toEqual(before)
      expect(await independent.packageCreditGrant.count({ where: { purchaseId } })).toBe(0)
      expect(await independent.packagePaymentReceipt.count({ where: { purchaseId } })).toBe(0)
    })
    it.each(['refundAmountInCents', 'refundPendingAmountInCents', 'refundFailedCount'] as const)(`package settlement refund inventory on ${type} preserves unbacked %s`, async field => {
      const { session } = await paidSession()
      await prisma.packagePurchase.update({ where: { id: purchaseId }, data: { [field]: 1 } })
      const before = await readPurchase()
      expect((await deliverCurrentPayment(session)).status).toBe(409)
      expect(await readPurchase()).toEqual(before)
      expect(await independent.packageCreditGrant.count({ where: { purchaseId } })).toBe(0)
      expect(await independent.packagePaymentReceipt.count({ where: { purchaseId } })).toBe(0)
    })
  }
  it.each(['missing-session', 'retired', 'provider-failure', 'wrong-destination', 'missing-refund'])('does not replace accounting on history refresh %s', async mode => {
    if (mode === 'missing-session') {
      provider.create.mockRejectedValue(new Error('provider outcome unknown'))
      await expect(startOrResumePackageCheckout(purchaseId, parentId)).rejects.toThrow()
    } else await paidSession()
    const attempt = await readAttempt()
    if (mode === 'retired') await prisma.packageCheckoutAttempt.update({ where: { id: attempt.id }, data: { retiredAt: new Date() } })
    if (mode === 'provider-failure') provider.retrieve.mockRejectedValue(new Error('provider unavailable'))
    if (mode === 'wrong-destination') f.transfer.destination = 'acct_other'
    if (mode === 'missing-refund') f.charge.amount_refunded = 1000
    const previous = await readPurchase()
    await expect(refreshPackageHistory({ id: parentId, role: 'PARENT' }, purchaseId)).rejects.toThrow()
    expect(await readPurchase()).toEqual(previous); expect(await prisma.packageRefund.count()).toBe(0)
  })
  it('serializes repeated and concurrent owned refreshes without duplicating refunds', async () => {
    await paidSession(); refunds = [refundReceipt()]; f.charge.amount_refunded = 1000
    await Promise.all([refreshPackageHistory({ id: parentId, role: 'PARENT' }, purchaseId), refreshPackageHistory({ id: trainerId, role: 'TRAINER' }, purchaseId)])
    expect(await prisma.packageRefund.count({ where: { purchaseId } })).toBe(1)
    expect((await readPurchase()).refundAmountInCents).toBe(1000)
  })
  it.each(['charge.refunded', 'refund.created', 'refund.updated', 'refund.failed', 'charge.refund.updated'])('records current package refund history from signed %s delivery', async type => {
    await paidSession(); refunds = [refundReceipt()]; f.charge.amount_refunded = 1000
    const object = type === 'charge.refunded' ? f.charge : { ...refunds[0], amount: 6000, status: 'pending' }
    expect((await webhook(object, type)).status).toBe(200)
    expect(await readPurchase()).toMatchObject({ status: 'PARTIALLY_REFUNDED', refundAmountInCents: 1000,
      refundPendingAmountInCents: 0, refundFailedCount: 0, refundsVerifiedAt: expect.any(Date), stripeChargeId: f.charge.id })
    expect(await independent.packageRefund.findMany({ where: { purchaseId } })).toMatchObject([{ id: 're_package', purchaseId, amountInCents: 1000, status: 'SUCCEEDED' }])
    expect(await prisma.paymentRefund.count()).toBe(0); expect(await prisma.booking.count()).toBe(0); expect(await prisma.walletEntry.count()).toBe(0)
  })
  it.each(['pending', 'requires_action', 'succeeded', 'failed', 'canceled'])('distinguishes current %s package refunds from customer money received', async status => {
    await paidSession(); refunds = [refundReceipt({ amount: 6000, status })]
    if (status === 'succeeded') { f.charge.amount_refunded = 6000; f.charge.refunded = true }
    expect((await webhook(refunds[0], 'refund.updated')).status).toBe(200)
    expect(await readPurchase()).toMatchObject({ status: status === 'succeeded' ? 'REFUNDED' : 'SUCCEEDED',
      refundAmountInCents: status === 'succeeded' ? 6000 : 0,
      refundPendingAmountInCents: ['pending', 'requires_action'].includes(status) ? 6000 : 0,
      refundFailedCount: ['failed', 'canceled'].includes(status) ? 1 : 0 })
  })
  it('tracks pending to failed to replacement success without treating failures as refunds', async () => {
    const { session } = await paidSession(); refunds = [refundReceipt({ status: 'pending' })]
    await reconcileRefundEvent(f.charge.id, refunds[0].id)
    refunds[0].status = 'failed'; refunds[0].failure_reason = 'declined'; refunds[0].failure_balance_transaction = 'txn_failure'
    await reconcileRefundEvent(f.charge.id, refunds[0].id)
    expect(await readPurchase()).toMatchObject({ status: 'SUCCEEDED', refundAmountInCents: 0, refundPendingAmountInCents: 0, refundFailedCount: 1 })
    refunds.push(refundReceipt({ id: 're_replacement', transfer_reversal: 'trr_test' })); f.charge.amount_refunded = 1000
    await reconcileRefundEvent(f.charge.id, 're_replacement')
    expect((await webhook(session)).status).toBe(200)
    expect(await readPurchase()).toMatchObject({ status: 'PARTIALLY_REFUNDED', refundAmountInCents: 1000, refundFailedCount: 1 })
    expect(await independent.packageRefund.findUniqueOrThrow({ where: { id: 're_package' } })).toMatchObject({ status: 'FAILED', failureReason: 'declined', failureBalanceTransactionId: 'txn_failure' })
  })
  it('reads multiple refund pages and records successful, pending and failed totals separately', async () => {
    await paidSession(); f.charge.amount_refunded = 1000
    const first = refundReceipt(), second = refundReceipt({ id: 're_pending', amount: 2000, status: 'pending' }), third = refundReceipt({ id: 're_failed', status: 'failed' })
    provider.refunds.mockResolvedValueOnce({ data: [first], has_more: true }).mockResolvedValueOnce({ data: [second, third], has_more: false })
    expect((await webhook(second, 'refund.updated')).status).toBe(200)
    expect(provider.refunds.mock.calls[1][0]).toEqual({ charge: f.charge.id, limit: 100, starting_after: first.id })
    expect(await readPurchase()).toMatchObject({ refundAmountInCents: 1000, refundPendingAmountInCents: 2000, refundFailedCount: 1 })
  })
  it('serializes repeated and concurrent package refund reconciliation', async () => {
    await paidSession(); refunds = [refundReceipt()]; f.charge.amount_refunded = 1000
    await Promise.all([reconcileRefundEvent(f.charge.id, 're_package'), reconcileRefundEvent(f.charge.id, 're_package')])
    await reconcileRefundEvent(f.charge.id, 're_package')
    expect(await independent.packageRefund.count({ where: { purchaseId } })).toBe(1)
    expect((await readPurchase()).refundAmountInCents).toBe(1000)
  })
  it.each(['charge', 'intent', 'currency', 'amount-zero', 'amount-negative', 'amount-over', 'amount-fraction', 'status', 'created'])('rejects invalid refund %s and rolls back all package accounting', async mode => {
    await paidSession(); refunds = [refundReceipt()]; f.charge.amount_refunded = 1000
    if (mode === 'charge') refunds[0].charge = 'ch_wrong'
    if (mode === 'intent') refunds[0].payment_intent = 'pi_wrong'
    if (mode === 'currency') refunds[0].currency = 'eur'
    if (mode === 'amount-zero') refunds[0].amount = 0
    if (mode === 'amount-negative') refunds[0].amount = -1
    if (mode === 'amount-over') refunds[0].amount = 6001
    if (mode === 'amount-fraction') refunds[0].amount = 0.5
    if (mode === 'status') refunds[0].status = 'unknown'
    if (mode === 'created') refunds[0].created = -1
    const previous = await readPurchase()
    expect((await webhook(f.charge, 'charge.refunded')).status).toBe(409)
    expect(await readPurchase()).toEqual(previous)
    expect(await independent.packageRefund.count()).toBe(0)
  })
  it.each(['duplicate', 'incomplete-page', 'missing-trigger', 'missing-history', 'overflow', 'provider-down'])('does not persist a misleading refund state for %s history', async mode => {
    await paidSession(); const previous = await readPurchase()
    refunds = [refundReceipt()]; f.charge.amount_refunded = 1000
    if (mode === 'duplicate') refunds.push(refundReceipt())
    if (mode === 'incomplete-page') provider.refunds.mockResolvedValue({ data: [], has_more: true })
    if (mode === 'missing-trigger') refunds[0].id = 're_other'
    if (mode === 'missing-history') refunds = []
    if (mode === 'overflow') refunds.push(refundReceipt({ id: 're_pending', status: 'pending', amount: 6000 }))
    if (mode === 'provider-down') provider.refunds.mockRejectedValue(new Error('provider unavailable'))
    expect((await webhook(refundReceipt(), 'refund.updated')).status).toBe(mode === 'provider-down' ? 503 : 409)
    expect(await readPurchase()).toEqual(previous)
    expect(await independent.packageRefund.count()).toBe(0)
  })
  it.each(['failed', 'requires_action'])('records a late successful-refund return as %s and retains review through paid replay', async status => {
    const { session } = await paidSession()
    refunds = [refundReceipt({ amount: 6000 })]; f.charge.amount_refunded = 6000; f.charge.refunded = true
    expect((await webhook(refunds[0], 'refund.updated')).status).toBe(200)
    expect((await readPurchase()).status).toBe('REFUNDED')
    Object.assign(refunds[0], { status, failure_reason: status === 'failed' ? 'declined' : null,
      failure_balance_transaction: status === 'failed' ? 'txn_returned' : null })
    f.charge.amount_refunded = 0; f.charge.refunded = false
    expect((await webhook(refunds[0], 'refund.updated')).status).toBe(200)
    const expected = { status: 'SUCCEEDED', refundAmountInCents: 0, refundPendingAmountInCents: status === 'requires_action' ? 6000 : 0,
      refundFailedCount: status === 'failed' ? 1 : 0, financialReview: { key: expect.any(String), details: { packageRefunds: {
        refundedInCents: 0, pendingInCents: status === 'requires_action' ? 6000 : 0, failedCount: status === 'failed' ? 1 : 0 } } } }
    expect(await readPurchase()).toMatchObject(expected)
    expect(await independent.packageRefund.findUniqueOrThrow({ where: { id: 're_package' } })).toMatchObject({
      status: status.toUpperCase(), failureReason: refunds[0].failure_reason, failureBalanceTransactionId: refunds[0].failure_balance_transaction })
    expect((await webhook(session)).status).toBe(200)
    expect(await readPurchase()).toMatchObject(expected)
    expect((await webhook(f.charge, 'charge.updated')).status).toBe(200)
    expect(await readPurchase()).toMatchObject(expected)
    expect(await prisma.booking.count()).toBe(0); expect(await prisma.walletEntry.count()).toBe(0)
  })
  it.each(['amount', 'full-status', 'partial-status'])('rejects unexplained prior refund %s without wiping accounting', async mode => {
    await paidSession(); refunds = [refundReceipt({ status: 'failed' })]
    await independent.packagePurchase.update({ where: { id: purchaseId }, data: mode === 'amount' ? { refundAmountInCents: 1000 } :
      { status: mode === 'full-status' ? 'REFUNDED' : 'PARTIALLY_REFUNDED' } })
    const previous = await readPurchase()
    expect((await webhook(refunds[0], 'refund.updated')).status).toBe(409)
    expect(await readPurchase()).toEqual(previous)
    expect(await independent.packageRefund.count()).toBe(0)
  })
  it('retains both settlement reversal and package refund review on paid replay', async () => {
    const { session } = await paidSession(); refunds = [refundReceipt({ status: 'failed' })]
    f.transfer.amount_reversed = 1000
    expect((await webhook(refunds[0], 'refund.updated')).status).toBe(200)
    const review = (await readPurchase()).financialReview
    expect(review).toMatchObject({ details: { transferReversedInCents: 1000, packageRefunds: { failedCount: 1 } } })
    expect((await webhook(session)).status).toBe(200)
    expect((await readPurchase()).financialReview).toEqual(review)
  })
  it.each(['missing', 'amount', 'created'])('retains recorded refund identity on later %s provider evidence', async mode => {
    await paidSession(); refunds = [refundReceipt()]; f.charge.amount_refunded = 1000
    await reconcileRefundEvent(f.charge.id)
    const previous = await readPurchase(), row = await independent.packageRefund.findUniqueOrThrow({ where: { id: 're_package' } })
    if (mode === 'missing') { refunds = []; f.charge.amount_refunded = 0 }
    if (mode === 'amount') refunds[0].amount = 900
    if (mode === 'created') refunds[0].created++
    expect((await webhook(f.charge, 'charge.refunded')).status).toBe(409)
    expect(await readPurchase()).toEqual(previous)
    expect(await independent.packageRefund.findUniqueOrThrow({ where: { id: 're_package' } })).toEqual(row)
  })
  it('requires full destination settlement verification on package refund events', async () => {
    await paidSession(); refunds = [refundReceipt()]; f.charge.amount_refunded = 1000; f.transfer.destination = 'acct_wrong'
    expect((await webhook(refunds[0], 'refund.updated')).status).toBe(409)
    expect(provider.refunds).not.toHaveBeenCalled()
    expect((await readPurchase()).status).toBe('PENDING')
  })
  it.each(['constructor', '__proto__'])('rejects prototype-named refund status %s as a conflict', async status => {
    await paidSession(); refunds = [refundReceipt({ status })]
    expect((await webhook(refunds[0], 'refund.updated')).status).toBe(409)
    expect(await independent.packageRefund.count()).toBe(0)
  })
  it('does not silently acknowledge package refund metadata without a charge identity', async () => {
    expect((await webhook({ id: 're_missing_charge', metadata: { paymentKind: 'package' } }, 'refund.updated')).status).toBe(409)
    expect(provider.refunds).not.toHaveBeenCalled()
  })
  it('rejects a refund ID already linked to another package without editing that ledger', async () => {
    await paidSession(); refunds = [refundReceipt()]; f.charge.amount_refunded = 1000
    const purchase = await readPurchase()
    const other = await preparePackagePurchase(parentId, { requestId: randomUUID(), packageId: purchase.packageId,
      catalogRevision: purchase.catalogRevision.toISOString(), expectedTotalInCents: 6000 })
    const recorded = await independent.packageRefund.create({ data: { id: 're_package', purchaseId: other.id,
      stripeChargeId: f.charge.id, stripePaymentIntentId: f.intent.id, amountInCents: 1000, currency: 'usd', status: 'PENDING',
      stripeCreatedAt: new Date(1791749000000), observedAt: new Date() } })
    expect((await webhook(refunds[0], 'refund.updated')).status).toBe(409)
    expect(await independent.packageRefund.findUniqueOrThrow({ where: { id: 're_package' } })).toEqual(recorded)
    expect(await readPurchase()).toEqual(purchase)
  })
  it.each(['amount', 'currency', 'charge', 'intent', 'created'])('database rejects rewriting package refund %s', async mode => {
    await paidSession(); refunds = [refundReceipt()]; f.charge.amount_refunded = 1000
    await reconcileRefundEvent(f.charge.id)
    const data = mode === 'amount' ? { amountInCents: 500 } : mode === 'currency' ? { currency: 'eur' } :
      mode === 'charge' ? { stripeChargeId: 'ch_other' } : mode === 'intent' ? { stripePaymentIntentId: 'pi_other' } : { stripeCreatedAt: new Date() }
    await expect(independent.packageRefund.update({ where: { id: 're_package' }, data })).rejects.toThrow('immutable')
  })
  it.each([{ refundAmountInCents: -1 }, { refundPendingAmountInCents: -1 }, { refundFailedCount: -1 }, { refundAmountInCents: 5000, refundPendingAmountInCents: 2000 }])('database rejects invalid package refund totals %j', async data => {
    await expect(independent.packagePurchase.update({ where: { id: purchaseId }, data })).rejects.toThrow()
  })
  it.each(['transfer.created', 'transfer.updated', 'transfer.reversed', 'application_fee.created', 'application_fee.refunded',
    'application_fee.refund.updated', 'charge.updated', 'charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.closed',
    'charge.dispute.funds_withdrawn', 'charge.dispute.funds_reinstated'])('reconciles package lifecycle %s even before checkout completion delivery', async type => {
    await paidSession()
    let object: any
    if (type.startsWith('transfer.')) { f.transfer.amount_reversed = 500; object = f.transfer }
    else if (type.startsWith('application_fee.')) {
      f.fee.amount_refunded = 100
      object = type === 'application_fee.refund.updated' ? { id: 'fr_test', fee: f.fee.id } : f.fee
    } else if (type.startsWith('charge.dispute.')) {
      f.disputes = [settlementDispute(f)]; object = f.disputes[0]
    } else { f.charge.amount_refunded = 1000; refunds = [refundReceipt()]; object = f.charge }
    expect((await webhook(object, type)).status).toBe(200)
    expect(await readPurchase()).toMatchObject({ status: type === 'charge.updated' ? 'PARTIALLY_REFUNDED' : 'SUCCEEDED', stripeChargeId: f.charge.id,
      stripeTransferId: f.transfer.id, settlementVerifiedAt: expect.any(Date), financialReview: { key: expect.any(String) } })
    expect(await prisma.payment.count()).toBe(0); expect(await prisma.booking.count()).toBe(0); expect(await prisma.walletEntry.count()).toBe(0)
  })
  it('uses current receipts for delayed and repeated lifecycle snapshots', async () => {
    const { session } = await paidSession()
    await webhook(session)
    const old = structuredClone(f.transfer)
    f.transfer.amount_reversed = 6000; f.transfer.reversed = true
    expect((await webhook(old, 'transfer.updated')).status).toBe(200)
    const reviewed = await readPurchase()
    expect(reviewed.financialReview).toMatchObject({ details: { transferReversedInCents: 6000, transferReversed: true } })
    expect((await webhook(old, 'transfer.updated')).status).toBe(200)
    expect((await readPurchase()).financialReview).toEqual(reviewed.financialReview)
    expect(await prisma.walletEntry.count()).toBe(0)
  })
  it.each(['kind', 'purchase', 'attempt', 'booking', 'payment', 'booking-attempt', 'wrong-purchase', 'wrong-attempt'])('rejects %s package lifecycle identity without changing verified receipts', async mode => {
    const { session } = await paidSession(); await webhook(session)
    const previous = await readPurchase()
    if (mode === 'kind') delete f.charge.metadata.paymentKind
    if (mode === 'purchase') delete f.charge.metadata.packagePurchaseId
    if (mode === 'attempt') delete f.charge.metadata.packageCheckoutAttemptId
    if (mode === 'booking') f.charge.metadata.bookingId = 'unrelated'
    if (mode === 'payment') f.charge.metadata.paymentId = 'unrelated'
    if (mode === 'booking-attempt') f.charge.metadata.checkoutAttemptId = 'unrelated'
    if (mode === 'wrong-purchase') f.charge.metadata.packagePurchaseId = 'unknown'
    if (mode === 'wrong-attempt') f.charge.metadata.packageCheckoutAttemptId = 'unknown'
    expect((await webhook(f.charge, 'charge.updated')).status).toBe(409)
    expect(await readPurchase()).toEqual(previous)
  })
  it.each(['destination', 'fee', 'transfer-source', 'fee-source', 'intent', 'dispute-missing', 'provider-outage'])('refuses lifecycle %s mismatches without replacing stored state', async mode => {
    const { session } = await paidSession(); await webhook(session)
    const previous = await readPurchase()
    let type = 'charge.updated', object = f.charge
    if (mode === 'destination') f.intent.transfer_data.destination = 'acct_wrong'
    if (mode === 'fee') f.fee.amount++
    if (mode === 'transfer-source') {
      type = 'transfer.reversed'; object = { ...f.transfer, id: 'tr_wrong' }
      provider.transfer.mockResolvedValueOnce(object)
    }
    if (mode === 'fee-source') {
      type = 'application_fee.refunded'; object = { ...f.fee, id: 'fee_wrong' }
      provider.fee.mockResolvedValueOnce(object)
    }
    if (mode === 'intent') provider.charge.mockResolvedValueOnce({ ...f.charge, payment_intent: 'pi_wrong' })
    if (mode === 'dispute-missing') { type = 'charge.dispute.updated'; object = settlementDispute(f) }
    if (mode === 'provider-outage') provider.disputes.mockRejectedValue(new Error('provider unavailable'))
    expect((await webhook(object, type)).status).toBe(['provider-outage', 'dispute-missing'].includes(mode) ? 503 : 409)
    expect(await readPurchase()).toEqual(previous)
  })
  it('requests retry for a financial event before the lost create response is attached', async () => {
    provider.create.mockImplementationOnce(async parameters => { createSession(parameters); throw new Error('lost response') })
    await expect(startOrResumePackageCheckout(purchaseId, parentId)).rejects.toThrow('lost response')
    const attempt = await readAttempt(), session = [...sessions.values()][0]
    f.charge.metadata = f.intent.metadata = structuredClone(session.metadata)
    Object.assign(session, { status: 'complete', payment_status: 'paid', payment_intent: f.intent.id })
    expect((await webhook(f.transfer, 'transfer.created')).status).toBe(503)
    expect((await readPurchase()).status).toBe('PENDING')
    expect((await readAttempt()).stripeCheckoutSessionId).toBeNull()
    await reconcilePackageCheckout(purchaseId, attempt.id, session.id)
    expect((await webhook(f.transfer, 'transfer.created')).status).toBe(200)
  })
  it('rejects lifecycle events that resolve different purchases through provider identity and metadata', async () => {
    const { session } = await paidSession(); await webhook(session)
    const previous = await readPurchase()
    const second = await preparePackagePurchase(parentId, { requestId: randomUUID(), packageId: previous.packageId,
      catalogRevision: previous.catalogRevision.toISOString(), expectedTotalInCents: 6000 })
    f.charge.metadata.packagePurchaseId = second.id
    expect((await webhook(f.charge, 'charge.updated')).status).toBe(409)
    expect(await readPurchase()).toEqual(previous)
    expect((await prisma.packagePurchase.findUniqueOrThrow({ where: { id: second.id } })).status).toBe('PENDING')
  })
  it('does not ignore a recorded package transfer whose provider source charge disappears', async () => {
    const { session } = await paidSession(); await webhook(session)
    f.transfer.source_transaction = null
    expect((await webhook(f.transfer, 'transfer.updated')).status).toBe(409)
  })
  it('rejects a late financial event for a retired package attempt', async () => {
    await startOrResumePackageCheckout(purchaseId, parentId)
    const old = await readAttempt(), session = sessions.get(old.stripeCheckoutSessionId!)
    f.charge.metadata = f.intent.metadata = structuredClone(session.metadata)
    session.status = 'expired'
    await startOrResumePackageCheckout(purchaseId, parentId)
    const current = await readPurchase()
    expect((await webhook(f.charge, 'charge.updated')).status).toBe(409)
    expect(await readPurchase()).toEqual(current)
  })
  it('does not let lifecycle verification undo an existing refund status', async () => {
    await paidSession()
    refunds = [refundReceipt({ amount: 6000 })]; f.charge.amount_refunded = 6000; f.charge.refunded = true
    expect((await webhook(refunds[0], 'refund.updated')).status).toBe(200)
    expect((await webhook(f.charge, 'charge.updated')).status).toBe(200)
    expect((await readPurchase()).status).toBe('REFUNDED')
  })
  it('ignores connected-account lifecycle delivery without reading platform receipts', async () => {
    await paidSession(); provider.charge.mockClear(); provider.transfer.mockClear()
    expect((await webhook(f.transfer, 'transfer.updated', 'acct_settlement')).status).toBe(200)
    expect(provider.charge).not.toHaveBeenCalled(); expect(provider.transfer).not.toHaveBeenCalled()
    expect((await readPurchase()).status).toBe('PENDING')
  })
  it.each([false, 0, '', Prisma.JsonNull])('blocks checkout for a non-null financial review value %j', async financialReview => {
    await prisma.packagePurchase.update({ where: { id: purchaseId }, data: { financialReview } })
    await expect(startOrResumePackageCheckout(purchaseId, parentId)).rejects.toThrow('financial activity')
    expect(provider.account).not.toHaveBeenCalled()
    expect(provider.create).not.toHaveBeenCalled()
    expect(await independent.packageCheckoutAttempt.count({ where: { purchaseId } })).toBe(0)
  })
  it.each(['refundAmountInCents', 'refundPendingAmountInCents', 'refundFailedCount'] as const)('blocks checkout when %s records financial activity', async field => {
    await prisma.packagePurchase.update({ where: { id: purchaseId }, data: { [field]: 1 } })
    await expect(startOrResumePackageCheckout(purchaseId, parentId)).rejects.toThrow('financial activity')
    expect(provider.account).not.toHaveBeenCalled()
    expect(provider.create).not.toHaveBeenCalled()
    expect(await independent.packageCheckoutAttempt.count({ where: { purchaseId } })).toBe(0)
  })
  it('saves a distinct immutable package destination charge request and resumes its session', async () => {
    const result = await startOrResumePackageCheckout(purchaseId, parentId)
    expect(result).toMatchObject({ purchaseId, checkoutUrl: expect.stringMatching(/^https:\/\/checkout.stripe.com\//) })
    const attempt = await readAttempt(), parameters = attempt.parameters as any
    expect(parameters).toMatchObject({ metadata: { paymentKind: 'package', packagePurchaseId: purchaseId, packageCheckoutAttemptId: attempt.id },
      line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: 6000 } }],
      payment_intent_data: { application_fee_amount: 900, transfer_data: { destination: 'acct_settlement' } } })
    expect(parameters.metadata).not.toHaveProperty('bookingId')
    expect(provider.create).toHaveBeenCalledExactlyOnceWith(parameters, { timeout: 8000, maxNetworkRetries: 0, idempotencyKey: `trainr-package-checkout-${attempt.id}` })
    expect(await startOrResumePackageCheckout(purchaseId, parentId)).toEqual(result)
    expect(provider.create).toHaveBeenCalledTimes(1)
    expect((await readPurchase()).status).toBe('PENDING')
    expect(await prisma.booking.count()).toBe(0); expect(await prisma.payment.count()).toBe(0); expect(await prisma.walletEntry.count()).toBe(0)
  })
  it('retries a lost provider response with identical durable parameters and key', async () => {
    provider.create.mockImplementationOnce(async parameters => { createSession(parameters); throw new Error('response lost') })
    await expect(startOrResumePackageCheckout(purchaseId, parentId)).rejects.toThrow('response lost')
    expect((await readAttempt()).stripeCheckoutSessionId).toBeNull()
    await startOrResumePackageCheckout(purchaseId, parentId)
    expect(provider.create.mock.calls[1]).toEqual(provider.create.mock.calls[0])
    expect(sessions.size).toBe(1)
  })
  it('serializes concurrent requests to the same provider key and one persisted attempt', async () => {
    const results = await Promise.all([startOrResumePackageCheckout(purchaseId, parentId), startOrResumePackageCheckout(purchaseId, parentId)])
    expect(results[0]).toEqual(results[1])
    expect(await prisma.packageCheckoutAttempt.count({ where: { purchaseId } })).toBe(1)
    expect(sessions.size).toBe(1)
  })
  it('refuses to replay an unknown provider outcome after the idempotency recovery window', async () => {
    provider.create.mockImplementationOnce(async parameters => { createSession(parameters); throw new Error('response lost') })
    await expect(startOrResumePackageCheckout(purchaseId, parentId)).rejects.toThrow('response lost')
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 24 * 60 * 60 * 1000)
    try { await expect(startOrResumePackageCheckout(purchaseId, parentId)).rejects.toThrow('safe retry window') }
    finally { now.mockRestore() }
    expect(provider.create).toHaveBeenCalledTimes(1)
    expect(sessions.size).toBe(1)
  })
  it.each(['not-ready', 'transfers-disabled', 'wrong-account', 'provider-down'])('does not create a checkout when Connect is %s', async mode => {
    if (mode === 'not-ready') provider.account.mockResolvedValue({ id: 'acct_settlement', details_submitted: false })
    if (mode === 'transfers-disabled') provider.account.mockResolvedValue({ id: 'acct_settlement', details_submitted: true, charges_enabled: true, payouts_enabled: true, capabilities: { transfers: 'inactive' } })
    if (mode === 'wrong-account') provider.account.mockResolvedValue({ id: 'acct_other' })
    if (mode === 'provider-down') provider.account.mockRejectedValue(new Error('provider down'))
    await expect(startOrResumePackageCheckout(purchaseId, parentId)).rejects.toThrow()
    expect(provider.create).not.toHaveBeenCalled()
    expect(await prisma.packageCheckoutAttempt.count({ where: { purchaseId } })).toBe(0)
  })
  it('rejects a foreign buyer without provider access', async () => {
    await expect(startOrResumePackageCheckout(purchaseId, trainerId)).rejects.toMatchObject({ status: 404 })
    expect(provider.account).not.toHaveBeenCalled(); expect(provider.create).not.toHaveBeenCalled()
  })
  it.each(['package', 'service', 'revision'])('refuses checkout when reviewed %s terms are no longer available', async mode => {
    const purchase = await readPurchase()
    if (mode === 'package') await prisma.package.update({ where: { id: purchase.packageId }, data: { isActive: false } })
    if (mode === 'revision') await prisma.package.update({ where: { id: purchase.packageId }, data: { priceInCents: 7000 } })
    if (mode === 'service') await prisma.serviceOffering.updateMany({ where: { trainerProfileId }, data: { isActive: false } })
    await expect(startOrResumePackageCheckout(purchaseId, parentId)).rejects.toThrow()
    expect(provider.create).not.toHaveBeenCalled()
    expect(await prisma.packageCheckoutAttempt.count({ where: { purchaseId } })).toBe(0)
  })
  it.each(['parent', 'trainer', 'account', 'package', 'service', 'review-null', 'review-false', 'refund'])('withholds checkout when %s access changes during the provider call, retaining identity', async mode => {
    provider.create.mockImplementationOnce(async parameters => {
      const session = createSession(parameters)
      if (mode === 'parent') await independent.user.update({ where: { id: parentId }, data: { deletedAt: new Date() } })
      if (mode === 'trainer') await independent.trainerProfile.update({ where: { id: trainerProfileId }, data: { isActive: false } })
      if (mode === 'account') await independent.trainerProfile.update({ where: { id: trainerProfileId }, data: { stripeAccountId: 'acct_changed' } })
      if (mode === 'package') await independent.package.update({ where: { id: (await readPurchase()).packageId }, data: { isActive: false } })
      if (mode === 'service') await independent.serviceOffering.updateMany({ where: { trainerProfileId }, data: { isActive: false } })
      if (mode === 'review-null' || mode === 'review-false') await independent.packagePurchase.update({ where: { id: purchaseId }, data: { financialReview: mode === 'review-null' ? Prisma.JsonNull : false } })
      if (mode === 'refund') await independent.packagePurchase.update({ where: { id: purchaseId }, data: { refundPendingAmountInCents: 1 } })
      return session
    })
    await expect(startOrResumePackageCheckout(purchaseId, parentId)).rejects.toThrow()
    expect((await readPurchase()).stripeCheckoutSessionId).toBeTruthy()
    expect(provider.expire).toHaveBeenCalledOnce()
    expect((await readPurchase()).status).toBe('PENDING')
  })
  it.each(['paid-amount', 'identity', 'currency', 'recovery', 'booking-metadata', 'url'])('rejects a mismatched %s checkout response', async mode => {
    provider.create.mockImplementationOnce(async parameters => ({ ...createSession(parameters),
      ...(mode === 'paid-amount' ? { amount_total: 5000 } : mode === 'identity' ? { metadata: {} } : mode === 'currency' ? { currency: 'eur' } :
        mode === 'recovery' ? { recovered_from: 'cs_other' } : mode === 'booking-metadata' ? { metadata: { ...parameters.metadata, bookingId: 'unrelated' } } : { url: 'https://untrusted.example/pay' }) }))
    await expect(startOrResumePackageCheckout(purchaseId, parentId)).rejects.toThrow()
    expect((await readPurchase()).status).toBe('PENDING')
  })
  it('replaces only an expired unpaid checkout with no unresolved intent, preserving retired identity', async () => {
    await startOrResumePackageCheckout(purchaseId, parentId)
    const old = await readAttempt(); sessions.get(old.stripeCheckoutSessionId!).status = 'expired'
    await startOrResumePackageCheckout(purchaseId, parentId)
    const next = await readAttempt()
    expect(next.sequence).toBe(2); expect(next.id).not.toBe(old.id)
    expect((await independent.packageCheckoutAttempt.findUniqueOrThrow({ where: { id: old.id } })).retiredAt).not.toBeNull()
    expect(await independent.packageCheckoutAttempt.count({ where: { purchaseId, retiredAt: null } })).toBe(1)
  })
  it('does not replace an expired session whose intent is still processing', async () => {
    await startOrResumePackageCheckout(purchaseId, parentId)
    const old = await readAttempt(); Object.assign(sessions.get(old.stripeCheckoutSessionId!), { status: 'expired', payment_intent: 'pi_unresolved' })
    provider.intent.mockResolvedValue({ id: 'pi_unresolved', status: 'processing' })
    await expect(startOrResumePackageCheckout(purchaseId, parentId)).rejects.toThrow('unresolved')
    expect((await readAttempt()).id).toBe(old.id)
    expect(provider.create).toHaveBeenCalledTimes(1)
  })
  it('retires an expired session only after verifying its intent is canceled', async () => {
    await startOrResumePackageCheckout(purchaseId, parentId)
    const old = await readAttempt(); Object.assign(sessions.get(old.stripeCheckoutSessionId!), { status: 'expired', payment_intent: 'pi_canceled' })
    provider.intent.mockResolvedValue({ id: 'pi_canceled', status: 'canceled' })
    await startOrResumePackageCheckout(purchaseId, parentId)
    expect((await readAttempt()).sequence).toBe(2)
    expect((await readPurchase()).stripePaymentIntentId).toBeNull()
    expect((await independent.packageCheckoutAttempt.findUniqueOrThrow({ where: { id: old.id } })).stripeCheckoutSessionId).toBe(old.stripeCheckoutSessionId)
  })
  it.each(['parameters', 'session', 'active-duplicate'])('database protects %s attempt identity', async mode => {
    await startOrResumePackageCheckout(purchaseId, parentId)
    const attempt = await readAttempt()
    if (mode === 'active-duplicate') await expect(independent.packageCheckoutAttempt.create({ data: { purchaseId, sequence: 2, parameters: {} } })).rejects.toThrow()
    else await expect(independent.packageCheckoutAttempt.update({ where: { id: attempt.id }, data: mode === 'parameters' ? { parameters: {} } : { stripeCheckoutSessionId: 'cs_other' } })).rejects.toThrow('immutable')
  })
  it.each(['checkout.session.completed', 'checkout.session.async_payment_succeeded'])('reconciles signed %s with current captured charge, transfer and fee', async type => {
    const { session } = await paidSession()
    expect((await webhook(session, type)).status).toBe(200)
    expect(await readPurchase()).toMatchObject({ status: 'SUCCEEDED', stripeCheckoutSessionId: session.id, stripePaymentIntentId: f.intent.id,
      stripeChargeId: f.charge.id, stripeTransferId: f.transfer.id, settlementVerifiedAt: expect.any(Date), financialReview: null })
    expect(provider.transfer).toHaveBeenCalled(); expect(provider.fee).toHaveBeenCalled()
    expect(await prisma.payment.count()).toBe(0); expect(await prisma.booking.count()).toBe(0); expect(await prisma.walletEntry.count()).toBe(0)
  })
  it('handles concurrent paid delivery without creating another purchase, checkout or booking', async () => {
    const { session, attempt } = await paidSession()
    await Promise.all([reconcilePackageCheckout(purchaseId, attempt.id, session.id), reconcilePackageCheckout(purchaseId, attempt.id, session.id)])
    expect(await prisma.packagePurchase.count({ where: { id: purchaseId } })).toBe(1)
    expect(await prisma.packageCheckoutAttempt.count({ where: { purchaseId } })).toBe(1)
    expect(await prisma.booking.count()).toBe(0)
    await expect(startOrResumePackageCheckout(purchaseId, parentId)).rejects.toThrow('financial activity')
    expect(provider.create).toHaveBeenCalledTimes(1)
  })
  it('reconciles a paid session on retry without returning a second payment link', async () => {
    const { session } = await paidSession()
    await expect(startOrResumePackageCheckout(purchaseId, parentId)).rejects.toThrow('already completed')
    expect((await readPurchase()).stripeCheckoutSessionId).toBe(session.id)
    expect((await readPurchase()).status).toBe('SUCCEEDED')
    expect(provider.create).toHaveBeenCalledTimes(1)
  })
  it.each(['unpaid-current', 'wrong-destination', 'wrong-fee', 'wrong-metadata', 'mode-mismatch', 'missing-transfer', 'provider-outage'])('does not persist paid state from %s evidence', async mode => {
    const { session } = await paidSession()
    if (mode === 'unpaid-current') sessions.get(session.id).payment_status = 'unpaid'
    if (mode === 'wrong-destination') f.intent.transfer_data.destination = 'acct_other'
    if (mode === 'wrong-fee') f.fee.amount++
    if (mode === 'wrong-metadata') f.charge.metadata = { bookingId: 'unrelated', paymentId: 'payment', checkoutAttemptId: 'attempt' }
    if (mode === 'mode-mismatch') f.intent.livemode = true
    if (mode === 'missing-transfer') f.charge.transfer = null
    if (mode === 'provider-outage') provider.intent.mockRejectedValue(new Error('provider outage'))
    const response = await webhook({ ...session, payment_status: 'paid' })
    expect(response.status).toBe(['missing-transfer', 'provider-outage'].includes(mode) ? 503 : 409)
    expect(await readPurchase()).toMatchObject({ status: 'PENDING', stripeChargeId: null, stripeTransferId: null, settlementVerifiedAt: null })
  })
  it.each(['refund', 'reversal', 'fee-refund'])('records review requirements for current %s activity, without granting anything', async mode => {
    const { session } = await paidSession()
    if (mode === 'refund') { f.charge.amount_refunded = 1000; refunds = [refundReceipt()] }
    if (mode === 'reversal') f.transfer.amount_reversed = 500
    if (mode === 'fee-refund') f.fee.amount_refunded = 100
    expect((await webhook(session)).status).toBe(200)
    expect((await readPurchase()).financialReview).toMatchObject({ key: expect.any(String), details: expect.any(Object) })
    expect(await prisma.booking.count()).toBe(0); expect(await prisma.walletEntry.count()).toBe(0)
  })
  it('rejects ambiguous booking/package metadata before receipt reads', async () => {
    const { session } = await paidSession(); provider.retrieve.mockClear()
    expect((await webhook({ ...session, metadata: { ...session.metadata, bookingId: 'unrelated' } })).status).toBe(409)
    expect(provider.retrieve).not.toHaveBeenCalled()
    expect((await readPurchase()).status).toBe('PENDING')
  })
  it.each(['kind', 'purchase', 'attempt'])('rejects package metadata with missing %s instead of acknowledging fulfillment', async field => {
    const { session } = await paidSession(); provider.retrieve.mockClear()
    const metadata = { ...session.metadata }
    delete metadata[field === 'kind' ? 'paymentKind' : field === 'purchase' ? 'packagePurchaseId' : 'packageCheckoutAttemptId']
    expect((await webhook({ ...session, metadata })).status).toBe(409)
    expect(provider.retrieve).not.toHaveBeenCalled()
    expect((await readPurchase()).status).toBe('PENDING')
  })
  it('does not let a late paid event for a retired session replace the current attempt', async () => {
    await startOrResumePackageCheckout(purchaseId, parentId)
    const old = await readAttempt(), session = sessions.get(old.stripeCheckoutSessionId!)
    session.status = 'expired'
    await startOrResumePackageCheckout(purchaseId, parentId)
    const current = await readAttempt()
    expect((await webhook({ ...session, status: 'complete', payment_status: 'paid', payment_intent: f.intent.id })).status).toBe(409)
    expect((await readAttempt()).id).toBe(current.id)
    expect((await readPurchase()).status).toBe('PENDING')
  })
  it.each(['REFUNDED', 'PARTIALLY_REFUNDED'] as const)('preserves terminal refund state %s on repeated paid receipt verification', async status => {
    const { session } = await paidSession()
    const amount = status === 'REFUNDED' ? 6000 : 1000
    refunds = [refundReceipt({ amount })]; f.charge.amount_refunded = amount; f.charge.refunded = status === 'REFUNDED'
    expect((await webhook(refunds[0], 'refund.updated')).status).toBe(200)
    const before = await readPurchase()
    expect(before.status).toBe(status)
    expect((await webhook(session)).status).toBe(200)
    expect((await readPurchase()).status).toBe(status)
    expect((await readPurchase()).refundAmountInCents).toBe(before.refundAmountInCents)
    expect(await prisma.booking.count()).toBe(0)
  })
  it('ignores an unpaid package completion snapshot without promoting it', async () => {
    await startOrResumePackageCheckout(purchaseId, parentId)
    const attempt = await readAttempt(); provider.retrieve.mockClear()
    expect((await webhook(sessions.get(attempt.stripeCheckoutSessionId!))).status).toBe(200)
    expect(provider.retrieve).not.toHaveBeenCalled()
    expect((await readPurchase()).status).toBe('PENDING')
  })
  it('rejects an invalid signature and ignores connected-account package payment events', async () => {
    const { session } = await paidSession(); provider.retrieve.mockClear()
    expect((await webhook(session, undefined, undefined, false)).status).toBe(400)
    expect((await webhook(session, undefined, 'acct_settlement')).status).toBe(200)
    expect(provider.retrieve).not.toHaveBeenCalled()
    expect((await readPurchase()).status).toBe('PENDING')
  })
})
