import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ensureConnectAccount } from '@/lib/connect-accounts'
import { refreshConnectReadiness } from '@/lib/connect-readiness'
import { closeAccount } from '@/lib/account-closure'
import { GET, POST } from '@/app/api/payments/connect/route'
import { POST as legacyPost, GET as legacyGet } from '@/app/api/trainer/stripe-connect/route'
import { NextRequest } from 'next/server'

const provider = vi.hoisted(() => ({ create: vi.fn(), retrieve: vi.fn(), link: vi.fn(), dashboard: vi.fn(), auth: vi.fn(), configured: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getRequestUser: provider.auth }))
vi.mock('@/lib/stripe', () => ({ createConnectedAccount: provider.create, createAccountLink: provider.link, createDashboardLink: provider.dashboard,
  stripe: { accounts: { retrieve: provider.retrieve } }, stripeRuntimeStatus: provider.configured }))
vi.mock('@/lib/app-url', () => ({ toAbsoluteAppUrl: (path: string) => `https://configured.example.test${path}` }))
const independent = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL })
let userId: string
let trainerId: string
let verified = false
const request = () => new NextRequest('https://attacker.example.test/api/payments/connect', { headers: { 'x-forwarded-host': 'attacker.example.test' } })
const ready = (id = 'acct_existing', type = 'express') => ({ id, type, details_submitted: true, charges_enabled: true, payouts_enabled: true })
const read = () => independent.trainerProfile.findUniqueOrThrow({ where: { id: trainerId } })

beforeAll(async () => {
  const identity = await prisma.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`
  expect(identity[0].database).toMatch(/^trainr_audit_/)
  expect(await prisma.$queryRaw`SELECT purpose FROM trainr_test_guard`).toEqual([{ purpose: 'disposable integration database' }])
  verified = true
})
beforeEach(async () => {
  vi.resetAllMocks()
  const id = randomUUID()
  const user = await prisma.user.create({ data: { email: `connect-${id}@example.test`, passwordHash: 'not-a-login', role: 'TRAINER',
    trainerProfile: { create: { firstName: 'Synthetic', lastName: 'Trainer', slug: `connect-${id}` } } }, include: { trainerProfile: true } })
  userId = user.id
  trainerId = user.trainerProfile!.id
  provider.auth.mockResolvedValue({ id: userId, role: 'TRAINER' })
  provider.configured.mockReturnValue({ secretConfigured: true, publishableConfigured: true })
  const accounts = new Map<string, object>()
  provider.create.mockImplementation(async (_profile, _email, key) => {
    if (!accounts.has(key)) accounts.set(key, ready(`acct_${randomUUID()}`))
    return accounts.get(key)
  })
  provider.retrieve.mockImplementation(async id => ready(id))
  provider.link.mockResolvedValue({ url: 'https://connect.stripe.com/synthetic-onboarding' })
  provider.dashboard.mockResolvedValue({ url: 'https://connect.stripe.com/synthetic-dashboard' })
})
afterEach(async () => { if (verified && userId) await prisma.user.deleteMany({ where: { id: userId } }) })
afterAll(async () => { await prisma.$disconnect(); await independent.$disconnect() })

describe('real PostgreSQL Connect identity', () => {
  it('serializes provider reads across concurrent readiness writers', async () => {
    await prisma.trainerProfile.update({ where: { id: trainerId }, data: { stripeAccountId: 'acct_existing' } })
    let release!: () => void, entered!: () => void
    const started = new Promise<void>(resolve => { entered = resolve })
    provider.retrieve.mockImplementationOnce(async () => {
      const wait = new Promise<void>(resolve => { release = resolve })
      entered(); await wait
      return ready()
    }).mockResolvedValue({ ...ready(), payouts_enabled: false })
    const first = refreshConnectReadiness('acct_existing')
    await started
    const second = refreshConnectReadiness('acct_existing')
    try {
      await expect.poll(async () => {
        const [waiting] = await independent.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int AS count FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND cardinality(pg_blocking_pids(pid)) > 0 AND query LIKE '%trainer_profiles%'`
        return waiting.count
      }, { timeout: 3000 }).toBeGreaterThan(0)
      expect(provider.retrieve).toHaveBeenCalledTimes(1)
    } finally { release(); await Promise.all([first, second]) }
    expect(provider.retrieve).toHaveBeenCalledTimes(2)
    expect(provider.retrieve).toHaveBeenCalledWith('acct_existing', {}, { timeout: 4000, maxNetworkRetries: 0 })
    expect((await read()).stripeOnboardingComplete).toBe(false)
  })
  it('does not fetch or alter an account replaced while its profile lock was pending', async () => {
    await prisma.trainerProfile.update({ where: { id: trainerId }, data: { stripeAccountId: 'acct_existing', stripeOnboardingComplete: true } })
    let release!: () => void, entered!: () => void
    const started = new Promise<void>(resolve => { entered = resolve })
    const holder = independent.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM trainer_profiles WHERE id = ${trainerId} FOR UPDATE`
      const wait = new Promise<void>(resolve => { release = resolve })
      entered(); await wait
      await tx.trainerProfile.update({ where: { id: trainerId }, data: { stripeAccountId: 'acct_replacement', stripeOnboardingComplete: false } })
    })
    await started
    const refresh = refreshConnectReadiness('acct_existing')
    let result: Awaited<typeof refresh>
    try {
      await expect.poll(async () => {
        const [waiting] = await independent.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int AS count FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND cardinality(pg_blocking_pids(pid)) > 0 AND query LIKE '%trainer_profiles%'`
        return waiting.count
      }, { timeout: 3000 }).toBeGreaterThan(0)
    } finally { release(); await holder; result = await refresh }
    expect(result).toBeNull()
    expect(provider.retrieve).not.toHaveBeenCalled()
    expect(await read()).toMatchObject({ stripeAccountId: 'acct_replacement', stripeOnboardingComplete: false })
  })
  it.each(['provider-failure', 'wrong-identity'])('preserves last recorded readiness on %s and permits a verified retry', async kind => {
    await prisma.trainerProfile.update({ where: { id: trainerId }, data: { stripeAccountId: 'acct_existing', stripeOnboardingComplete: true } })
    if (kind === 'provider-failure') provider.retrieve.mockRejectedValueOnce(new Error('temporary provider failure'))
    else provider.retrieve.mockResolvedValueOnce(ready('acct_other'))
    await expect(refreshConnectReadiness('acct_existing')).rejects.toThrow()
    expect((await read()).stripeOnboardingComplete).toBe(true)
    provider.retrieve.mockResolvedValue({ ...ready(), payouts_enabled: false })
    await refreshConnectReadiness('acct_existing')
    expect((await read()).stripeOnboardingComplete).toBe(false)
  })
  it('clears readiness for a deleted provider account without losing the saved identity', async () => {
    await prisma.trainerProfile.update({ where: { id: trainerId }, data: { stripeAccountId: 'acct_existing', stripeOnboardingComplete: true } })
    provider.retrieve.mockResolvedValue({ id: 'acct_existing', deleted: true })
    await refreshConnectReadiness('acct_existing')
    expect(await read()).toMatchObject({ stripeAccountId: 'acct_existing', stripeOnboardingComplete: false })
    const body = await (await GET(request())).json()
    expect(body).toMatchObject({ stripeOnboardingComplete: false, chargesEnabled: null, payoutsEnabled: null })
    expect(body.providerError).toContain('could not be verified')
  })
  it.each(['acct_unknown', 'wrong', 'acct_'])('does not contact Stripe for unlinked/invalid identity %s', async id => {
    if (id === 'acct_unknown') expect(await refreshConnectReadiness(id)).toBeNull()
    else await expect(refreshConnectReadiness(id)).rejects.toThrow('identity')
    expect(provider.retrieve).not.toHaveBeenCalled()
    expect((await read()).stripeAccountId).toBeNull()
  })
  it('concurrent canonical and legacy requests attach one durable account', async () => {
    const responses = await Promise.all([POST(request()), legacyPost(request()), POST(request())])
    expect(responses.map(r => r.status)).toEqual([200, 200, 200])
    expect(new Set(provider.create.mock.calls.map(args => args[2])).size).toBe(1)
    expect(provider.create.mock.calls.every(args => args[0] === trainerId)).toBe(true)
    const attempt = await independent.connectAccountAttempt.findUniqueOrThrow({ where: { trainerProfileId: trainerId } })
    expect((await read()).stripeAccountId).toBe(attempt.stripeAccountId)
    expect(attempt.stripeAccountId).toBeTruthy()
    expect(attempt.email).toBeNull()
    expect((await responses[1].json()).url).toBe('https://connect.stripe.com/synthetic-dashboard')
  })
  it('retries an ambiguous response with the same key and immutable creation parameters', async () => {
    provider.create.mockRejectedValueOnce(new Error('response lost'))
    expect((await POST(request())).status).toBe(503)
    const call = provider.create.mock.calls[0]
    await prisma.user.update({ where: { id: userId }, data: { email: `changed-${randomUUID()}@example.test` } })
    expect((await POST(request())).status).toBe(200)
    expect(provider.create.mock.calls[1]).toEqual(call)
  })
  it('never recreates an ambiguous attempt past the bounded idempotency window', async () => {
    await prisma.connectAccountAttempt.create({ data: { trainerProfileId: trainerId, email: 'synthetic@example.test', createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000) } })
    expect((await POST(request())).status).toBe(409)
    expect(provider.create).not.toHaveBeenCalled()
    expect((await read()).stripeAccountId).toBeNull()
  })
  it.each(['standard', 'custom'])('preserves an existing %s identity without replacement', async type => {
    await prisma.trainerProfile.update({ where: { id: trainerId }, data: { stripeAccountId: 'acct_existing' } })
    provider.retrieve.mockResolvedValue({ ...ready('acct_existing', type), payouts_enabled: false })
    expect((await POST(request())).status).toBe(409)
    expect((await read()).stripeAccountId).toBe('acct_existing')
    expect(provider.create).not.toHaveBeenCalled()
    expect(provider.link).not.toHaveBeenCalled()
    expect(provider.dashboard).not.toHaveBeenCalled()
  })
  it.each(['No such account', 'StripeAuthenticationError', 'network timeout'])('preserves account and reports unverified on %s', async message => {
    await prisma.trainerProfile.update({ where: { id: trainerId }, data: { stripeAccountId: 'acct_existing', stripeOnboardingComplete: true } })
    provider.retrieve.mockRejectedValue(new Error(message))
    const body = await (await GET(request())).json()
    expect(body).toMatchObject({ stripeAccountId: 'acct_existing', stripeOnboardingComplete: false, chargesEnabled: null, payoutsEnabled: null, dashboardSupported: false, onboardingSupported: false })
    expect(body.providerError).toContain('could not be verified')
    expect((await POST(request())).status).toBe(503)
    expect((await read()).stripeAccountId).toBe('acct_existing')
    expect(provider.create).not.toHaveBeenCalled()
    expect((await (await legacyGet(request())).json()).onboardingComplete).toBe(false)
  })
  it('does not claim cached readiness when provider configuration is missing', async () => {
    await prisma.trainerProfile.update({ where: { id: trainerId }, data: { stripeAccountId: 'acct_existing', stripeOnboardingComplete: true } })
    provider.configured.mockReturnValue({ secretConfigured: false, publishableConfigured: false })
    expect(await (await GET(request())).json()).toMatchObject({ stripeOnboardingComplete: false, dashboardSupported: false, providerConfigured: false })
    expect(provider.retrieve).not.toHaveBeenCalled()
  })
  it('refreshes revoked readiness and uses configured callback URLs rather than request host', async () => {
    await prisma.trainerProfile.update({ where: { id: trainerId }, data: { stripeAccountId: 'acct_existing', stripeOnboardingComplete: true } })
    provider.retrieve.mockResolvedValue({ ...ready(), payouts_enabled: false })
    expect((await POST(request())).status).toBe(200)
    expect((await read()).stripeOnboardingComplete).toBe(false)
    expect(provider.link).toHaveBeenCalledWith('acct_existing', 'https://configured.example.test/trainer/dashboard?stripe=complete', 'https://configured.example.test/trainer/dashboard?stripe=refresh')
  })
  it('retains provider creation evidence without attaching after account deactivation', async () => {
    provider.create.mockImplementation(async () => {
      await independent.user.update({ where: { id: userId }, data: { deletedAt: new Date(), sessionVersion: { increment: 1 } } })
      return ready('acct_retained')
    })
    expect((await POST(request())).status).toBe(409)
    expect((await read()).stripeAccountId).toBeNull()
    expect((await independent.connectAccountAttempt.findUniqueOrThrow({ where: { trainerProfileId: trainerId } })).stripeAccountId).toBe('acct_retained')
    expect(provider.link).not.toHaveBeenCalled()
    expect(provider.dashboard).not.toHaveBeenCalled()
  })
  it('cannot overwrite an identity that changed while Stripe creation was in flight', async () => {
    provider.create.mockImplementation(async () => {
      await independent.trainerProfile.update({ where: { id: trainerId }, data: { stripeAccountId: 'acct_other' } })
      return ready('acct_retained')
    })
    await expect(ensureConnectAccount(userId)).rejects.toThrow('reconciliation')
    expect((await read()).stripeAccountId).toBe('acct_other')
    expect((await independent.connectAccountAttempt.findUniqueOrThrow({ where: { trainerProfileId: trainerId } })).stripeAccountId).toBe('acct_retained')
  })
  it('account closure redacts pending setup email without erasing the attempt or enabling a retry', async () => {
    provider.create.mockRejectedValue(new Error('response lost'))
    expect((await POST(request())).status).toBe(503)
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`
      await closeAccount(tx, userId)
    })
    const attempt = await independent.connectAccountAttempt.findUniqueOrThrow({ where: { trainerProfileId: trainerId } })
    expect(attempt.email).toBeNull()
    expect((await POST(request())).status).toBe(403)
    expect(provider.create).toHaveBeenCalledTimes(1)
  })
  it('withholds a generated login link if role changes in flight', async () => {
    await prisma.trainerProfile.update({ where: { id: trainerId }, data: { stripeAccountId: 'acct_existing' } })
    provider.dashboard.mockImplementation(async () => {
      await independent.user.update({ where: { id: userId }, data: { role: 'PARENT', sessionVersion: { increment: 1 } } })
      return { url: 'https://connect.stripe.com/private-link' }
    })
    const response = await POST(request())
    expect(response.status).toBe(403)
    expect(JSON.stringify(await response.json())).not.toContain('private-link')
  })
  it('preserves financial dashboard access when only the trainer listing is inactive', async () => {
    await prisma.trainerProfile.update({ where: { id: trainerId }, data: { stripeAccountId: 'acct_existing', isActive: false, approvalStatus: 'SUSPENDED' } })
    expect((await POST(request())).status).toBe(200)
    expect(provider.dashboard).toHaveBeenCalledWith('acct_existing')
    expect(provider.create).not.toHaveBeenCalled()
    expect((await read()).isActive).toBe(false)
  })
  it.each([null, { id: 'untrusted', role: 'PARENT' }, { id: 'untrusted', role: 'ADMIN' }])('rejects anonymous and non-trainer callers %s', async actor => {
    provider.auth.mockResolvedValue(actor)
    for (const handler of [GET, POST, legacyGet, legacyPost]) expect((await handler(request())).status).toBe(actor ? 403 : 401)
    expect(provider.create).not.toHaveBeenCalled()
    expect(provider.retrieve).not.toHaveBeenCalled()
  })
})
