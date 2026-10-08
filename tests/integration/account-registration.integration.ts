import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { encode } from 'next-auth/jwt'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/lib/auth'
import { requestAccountEmail } from '@/lib/account-email'
import { POST as register } from '@/app/api/auth/register/route'
import { GET as status, POST as verify } from '@/app/api/auth/verify/route'
import { POST as resend } from '@/app/api/auth/verification-email/route'
import { POST as forgot } from '@/app/api/auth/forgot-password/route'
import { POST as reset } from '@/app/api/auth/reset-password/route'

vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => ({ allowed: true }), getClientIp: () => 'synthetic' }))
const prefix = `registration-${randomUUID()}`
const secret = 'local-account-registration-only-not-for-deployment'
const password = 'Local-password-123'
const fetcher = vi.fn()
let sequence = 0
function input(role = 'PARENT') {
  return { email: `${prefix}-${++sequence}@example.test`, password, role, firstName: 'Synthetic', lastName: 'Registration', agreeToTerms: true, state: 'TX' }
}
function request(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
}
async function registered(role = 'PARENT') {
  const data = input(role)
  expect((await register(request('/api/auth/register', data))).status).toBe(201)
  return prisma.user.findUniqueOrThrow({ where: { email: data.email } })
}
async function signed(user: { id: string; role: string; sessionVersion: number }, path: string, method = 'GET') {
  const token = await encode({ secret, token: { sub: user.id, role: user.role, sessionVersion: user.sessionVersion } })
  return new NextRequest(`http://localhost${path}`, { method, headers: { cookie: `next-auth.session-token=${token}` } })
}
beforeAll(async () => {
  expect(await prisma.$queryRaw`SELECT purpose FROM trainr_test_guard`).toEqual([{ purpose: 'disposable integration database' }])
})
beforeEach(() => {
  vi.stubEnv('NEXTAUTH_SECRET', secret)
  vi.stubEnv('RESEND_API_KEY', 're_synthetic')
  vi.stubEnv('EMAIL_FROM', 'test@example.invalid')
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://trainr.cc')
  fetcher.mockReset().mockImplementation(async () => new Response(JSON.stringify({ id: randomUUID() })))
  vi.stubGlobal('fetch', fetcher)
})
afterEach(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: prefix } } })
  vi.unstubAllEnvs(); vi.unstubAllGlobals()
})
afterAll(async () => { await prisma.$disconnect() })

describe('actual PostgreSQL registration, email attempts and verification', () => {
  it.each(['PARENT', 'TRAINER'])('persists a %s account and accepts real credential login after registration', async role => {
    const data = input(role)
    const response = await register(request('/api/auth/register', { ...data, email: ` ${data.email.toUpperCase()} ` }))
    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body).toMatchObject({ email: data.email, role, verificationEmail: 'accepted' })
    expect(body).not.toHaveProperty('passwordHash')
    expect(body).not.toHaveProperty('verificationToken')
    const user = await prisma.user.findUniqueOrThrow({ where: { email: data.email }, include: { parentProfile: true, trainerProfile: true } })
    expect(user.verificationToken).toMatch(/^[a-f0-9]{64}$/)
    expect(role === 'PARENT' ? user.parentProfile?.state : user.trainerProfile?.state).toBe('TX')
    expect(await authOptions.providers[0].options.authorize({ email: ` ${data.email.toUpperCase()} `, password })).toMatchObject({ id: user.id, role })
  })
  it('allows exactly one concurrent registration for the normalized email', async () => {
    const data = input()
    const results = await Promise.all([register(request('/api/auth/register', data)), register(request('/api/auth/register', { ...data, email: data.email.toUpperCase() }))])
    expect(results.map(r => r.status).sort()).toEqual([201, 409])
    expect(await prisma.user.count({ where: { email: data.email } })).toBe(1)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('does not collide when same-named trainers register concurrently', async () => {
    const entries = [input('TRAINER'), input('TRAINER')]
    const results = await Promise.all(entries.map(data => register(request('/api/auth/register', data))))
    expect(results.map(r => r.status)).toEqual([201, 201])
    const profiles = await prisma.trainerProfile.findMany({ where: { user: { email: { in: entries.map(e => e.email) } } } })
    expect(new Set(profiles.map(p => p.slug)).size).toBe(2)
  })
  it('rolls the new trainer back when admin notification persistence fails', async () => {
    const admin = await prisma.user.create({ data: { email: `${prefix}-admin@example.test`, role: 'ADMIN', passwordHash: 'synthetic' } })
    const data = input('TRAINER')
    await prisma.$executeRawUnsafe(`ALTER TABLE notifications ADD CONSTRAINT registration_notification_failure CHECK (type <> 'NEW_TRAINER_SIGNUP')`)
    try {
      expect((await register(request('/api/auth/register', data))).status).toBe(500)
      expect(await prisma.user.findUnique({ where: { email: data.email } })).toBeNull()
      expect(fetcher).not.toHaveBeenCalled()
    } finally {
      await prisma.$executeRawUnsafe('ALTER TABLE notifications DROP CONSTRAINT registration_notification_failure')
    }
    expect((await register(request('/api/auth/register', data))).status).toBe(201)
    expect(await prisma.notification.count({ where: { userId: admin.id, type: 'NEW_TRAINER_SIGNUP' } })).toBe(1)
  })
  it('keeps a created account usable when the email provider is unavailable', async () => {
    fetcher.mockImplementation(async () => new Response('{}', { status: 503 }))
    const data = input()
    const response = await register(request('/api/auth/register', data))
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ verificationEmail: 'unavailable' })
    expect((await register(request('/api/auth/register', data))).status).toBe(409)
    expect(await authOptions.providers[0].options.authorize({ email: data.email, password })).not.toBeNull()
  })
  it.each([{ agreeToTerms: false }, { role: 'ADMIN' }, { firstName: ' ' }, { password: 'a'.repeat(73) }, { password: '\u00e9'.repeat(37) }])('rejects invalid registration without writes %j', async override => {
    const data = { ...input(), ...override }
    expect((await register(request('/api/auth/register', data))).status).toBe(400)
    expect(await prisma.user.findUnique({ where: { email: data.email } })).toBeNull()
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('does not consume verification through a GET and consumes it only once under concurrent POSTs', async () => {
    const user = await registered()
    expect((await status(new NextRequest(`http://localhost/api/auth/verify?token=${user.verificationToken}`))).status).toBe(401)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerified).toBeNull()
    const results = await Promise.all([verify(request('/api/auth/verify', { token: user.verificationToken })), verify(request('/api/auth/verify', { token: user.verificationToken }))])
    expect(results.map(r => r.status).sort()).toEqual([200, 400])
    expect(await (await status(await signed(user, '/api/auth/verify'))).json()).toEqual({ verified: true, role: 'PARENT' })
  })
  it('rejects expired and deactivated verification tokens', async () => {
    const user = await registered()
    await prisma.user.update({ where: { id: user.id }, data: { verificationExpiry: new Date(0) } })
    expect((await verify(request('/api/auth/verify', { token: user.verificationToken }))).status).toBe(400)
    await prisma.user.update({ where: { id: user.id }, data: { verificationExpiry: new Date(Date.now() + 60000), deletedAt: new Date() } })
    expect((await verify(request('/api/auth/verify', { token: user.verificationToken }))).status).toBe(400)
    expect(await requestAccountEmail(user.id, 'verification')).toBe('ineligible')
  })
  it('serializes retry token issuance and reuses the provider identity before the resend interval', async () => {
    const user = await registered()
    fetcher.mockClear()
    expect(await Promise.all([requestAccountEmail(user.id, 'reset'), requestAccountEmail(user.id, 'reset')])).toEqual(['accepted', 'accepted'])
    const keys = fetcher.mock.calls.map(call => call[1].headers.get('Idempotency-Key'))
    expect(new Set(keys).size).toBe(1)
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(JSON.parse(fetcher.mock.calls[0][1].body).text).toContain(stored.resetPasswordToken)
  })
  it('issues a new link on a later explicit request and rejects the superseded token', async () => {
    const user = await registered()
    await prisma.user.update({ where: { id: user.id }, data: { verificationExpiry: new Date(Date.now() + (24 * 60 - 16) * 60000) } })
    expect(await requestAccountEmail(user.id, 'verification')).toBe('accepted')
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(updated.verificationToken).not.toBe(user.verificationToken)
    expect((await verify(request('/api/auth/verify', { token: user.verificationToken }))).status).toBe(400)
    expect((await verify(request('/api/auth/verify', { token: updated.verificationToken }))).status).toBe(200)
  })
  it('requires current authentication to retry verification and sends only to the account address', async () => {
    expect((await resend(request('/api/auth/verification-email', {}))).status).toBe(401)
    const user = await registered('TRAINER')
    fetcher.mockClear()
    expect((await resend(await signed(user, '/api/auth/verification-email', 'POST'))).status).toBe(200)
    expect(JSON.parse(fetcher.mock.calls[0][1].body).to).toEqual([user.email])
    await prisma.user.update({ where: { id: user.id }, data: { sessionVersion: { increment: 1 } } })
    expect((await resend(await signed(user, '/api/auth/verification-email', 'POST'))).status).toBe(401)
  })
  it('uses the emailed reset token to change credentials once and revoke the old session', async () => {
    const user = await registered()
    fetcher.mockClear()
    expect((await forgot(request('/api/auth/forgot-password', { email: user.email }))).status).toBe(200)
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(JSON.parse(fetcher.mock.calls[0][1].body).text).toContain(`/auth/reset-password?token=${stored.resetPasswordToken}`)
    const data = { token: stored.resetPasswordToken, password: 'Changed-local-password-456' }
    expect((await reset(request('/api/auth/reset-password', data))).status).toBe(200)
    expect((await reset(request('/api/auth/reset-password', data))).status).toBe(400)
    expect((await status(await signed(user, '/api/auth/verify'))).status).toBe(401)
    expect(await authOptions.providers[0].options.authorize({ email: user.email, password: data.password })).toMatchObject({ id: user.id, sessionVersion: 1 })
  })
  it('uses the same recovery response for missing, active, deleted and provider-failed accounts', async () => {
    const missing = await (await forgot(request('/api/auth/forgot-password', { email: `${prefix}-absent@example.test` }))).json()
    const user = await registered()
    expect(await (await forgot(request('/api/auth/forgot-password', { email: user.email }))).json()).toEqual(missing)
    fetcher.mockImplementation(async () => new Response('{}', { status: 503 }))
    expect(await (await forgot(request('/api/auth/forgot-password', { email: user.email }))).json()).toEqual(missing)
    await prisma.user.update({ where: { id: user.id }, data: { deletedAt: new Date() } })
    fetcher.mockClear()
    expect(await (await forgot(request('/api/auth/forgot-password', { email: user.email }))).json()).toEqual(missing)
    expect(fetcher).not.toHaveBeenCalled()
  })
})
