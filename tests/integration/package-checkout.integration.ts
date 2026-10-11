import { randomUUID } from 'node:crypto'
import Stripe from 'stripe'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { preparePackagePurchase } from '@/lib/package-purchases'
import { startOrResumePackageCheckout } from '@/lib/package-checkout'
import { reconcilePackageCheckout } from '@/lib/package-settlement'
import { POST } from '@/app/api/payments/webhook/route'
import { settlementFixture } from '../helpers/stripe-settlement-fixture'

const provider = vi.hoisted(() => ({ create: vi.fn(), retrieve: vi.fn(), expire: vi.fn(), account: vi.fn(), intent: vi.fn(), charge: vi.fn(),
  transfer: vi.fn(), fee: vi.fn(), disputes: vi.fn(), signature: '' }))
const secret = 'whsec_synthetic_package_checkout'
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'stripe-signature': provider.signature }) }))
vi.mock('@/lib/stripe', async () => {
  const { default: SDK } = await import('stripe')
  return { stripeRuntimeStatus: () => ({ secretConfigured: true, webhookConfigured: true }),
    verifyWebhookSignature: (body: string, signature: string) => SDK.webhooks.constructEvent(body, signature, 'whsec_synthetic_package_checkout'),
    stripe: { accounts: { retrieve: provider.account }, checkout: { sessions: { create: provider.create, retrieve: provider.retrieve, expire: provider.expire } },
      paymentIntents: { retrieve: provider.intent }, charges: { retrieve: provider.charge }, transfers: { retrieve: provider.transfer },
      applicationFees: { retrieve: provider.fee }, disputes: { list: provider.disputes } } }
})
const independent = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL })
let parentId: string, trainerId: string, trainerProfileId: string, sportId: string, purchaseId: string
let verified = false, sessions = new Map<string, any>(), f: any
const readPurchase = () => independent.packagePurchase.findUniqueOrThrow({ where: { id: purchaseId } })
const readAttempt = () => independent.packageCheckoutAttempt.findFirstOrThrow({ where: { purchaseId }, orderBy: { sequence: 'desc' } })
function createSession(parameters: any) {
  const id = `cs_${parameters.metadata.packageCheckoutAttemptId}`
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
beforeAll(async () => {
  expect(await prisma.$queryRaw`SELECT purpose FROM trainr_test_guard`).toEqual([{ purpose: 'disposable integration database' }])
  expect(await prisma.$queryRaw`SELECT current_database() AS name`).toEqual([{ name: expect.stringMatching(/^trainr_audit_/) }])
  verified = true
})
beforeEach(async () => {
  vi.resetAllMocks(); sessions = new Map(); f = settlementFixture()
  const key = randomUUID()
  const sport = await prisma.sport.create({ data: { name: key, slug: key } }); sportId = sport.id
  const trainer = await prisma.user.create({ data: { email: `package-checkout-trainer-${key}@example.test`, passwordHash: 'not-a-login', role: 'TRAINER',
    trainerProfile: { create: { firstName: 'Synthetic', lastName: 'Trainer', slug: key, approvalStatus: 'APPROVED', stripeAccountId: 'acct_settlement',
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
})
afterEach(async () => {
  if (!verified) return
  await prisma.packagePurchase.deleteMany({ where: { trainerProfileId } })
  await prisma.user.deleteMany({ where: { id: { in: [parentId, trainerId] } } })
  await prisma.sport.delete({ where: { id: sportId } })
})
afterAll(async () => { await prisma.$disconnect(); await independent.$disconnect() })

describe('package checkout with real SQL, signatures and simulated Stripe receipts', () => {
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
  it.each(['parent', 'trainer', 'account', 'package', 'service'])('withholds checkout when %s access changes during the provider call, retaining identity', async mode => {
    provider.create.mockImplementationOnce(async parameters => {
      const session = createSession(parameters)
      if (mode === 'parent') await independent.user.update({ where: { id: parentId }, data: { deletedAt: new Date() } })
      if (mode === 'trainer') await independent.trainerProfile.update({ where: { id: trainerProfileId }, data: { isActive: false } })
      if (mode === 'account') await independent.trainerProfile.update({ where: { id: trainerProfileId }, data: { stripeAccountId: 'acct_changed' } })
      if (mode === 'package') await independent.package.update({ where: { id: (await readPurchase()).packageId }, data: { isActive: false } })
      if (mode === 'service') await independent.serviceOffering.updateMany({ where: { trainerProfileId }, data: { isActive: false } })
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
    if (mode === 'refund') f.charge.amount_refunded = 1000
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
    await prisma.packagePurchase.update({ where: { id: purchaseId }, data: { status } })
    expect((await webhook(session)).status).toBe(200)
    expect((await readPurchase()).status).toBe(status)
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
