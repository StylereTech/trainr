import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { encode } from 'next-auth/jwt'
import { hash } from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { authOptions, getRequestUser } from '@/lib/auth'
import { POST as resetPassword } from '@/app/api/auth/reset-password/route'
import { DELETE as deleteAccount } from '@/app/api/account/route'
import { GET as bookings } from '@/app/api/bookings/route'

vi.mock('@/lib/rate-limit', () => ({ rateLimit: () => ({ allowed: true }), getClientIp: () => 'local-test' }))

const secret = 'disposable-session-integration-secret-only'
const ids: string[] = []
const password = 'Original-local-password-123'
async function createUser(role: 'PARENT' | 'ADMIN' = 'PARENT') {
  const user = await prisma.user.create({ data: { email: `session-${randomUUID()}@example.test`, role,
    passwordHash: await hash(password, 4), ...(role === 'PARENT' ? { parentProfile: { create: {} } } : {}) } })
  ids.push(user.id)
  return user
}
async function request(user: { id: string; role: string; sessionVersion: number }, claims = {}) {
  const token = await encode({ secret, token: { sub: user.id, role: user.role, sessionVersion: user.sessionVersion, ...claims } })
  return new NextRequest('http://localhost/api/bookings', { headers: { cookie: `next-auth.session-token=${token}` } })
}
function resetRequest(token: string) {
  return new NextRequest('http://localhost/api/auth/reset-password', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, password: 'New-local-password-456' }) })
}

beforeAll(async () => {
  vi.stubEnv('NEXTAUTH_SECRET', secret)
  const marker = await prisma.$queryRaw<Array<{ purpose: string }>>`SELECT purpose FROM trainr_test_guard`
  expect(marker).toEqual([{ purpose: 'disposable integration database' }])
})
afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: ids } } })
  await prisma.$disconnect()
  vi.unstubAllEnvs()
})

describe('real database and encrypted-cookie session revocation', () => {
  it('resolves fresh identity and permits an actual authenticated bookings request', async () => {
    const user = await createUser()
    const req = await request(user, { email: 'stale@example.test', profileId: 'stale' })
    const current = await getRequestUser(req)
    expect(current).toMatchObject({ id: user.id, email: user.email, role: 'PARENT' })
    expect(current?.profileId).not.toBe('stale')
    expect((await bookings(req)).status).toBe(200)
  })
  it('rejects legacy cookies and mismatched role claims', async () => {
    const user = await createUser()
    expect(await getRequestUser(await request(user, { sessionVersion: undefined }))).toBeNull()
    expect((await bookings(await request(user, { role: 'ADMIN' }))).status).toBe(401)
  })
  it('does not revive old cookies when a role changes back', async () => {
    const user = await createUser()
    const req = await request(user)
    await prisma.user.update({ where: { id: user.id }, data: { role: 'TRAINER', sessionVersion: { increment: 1 } } })
    expect(await getRequestUser(req)).toBeNull()
    await prisma.user.update({ where: { id: user.id }, data: { role: 'PARENT', sessionVersion: { increment: 1 } } })
    expect(await getRequestUser(req)).toBeNull()
  })
  it('rejects cookies for a physically deleted user', async () => {
    const user = await createUser()
    const req = await request(user)
    await prisma.user.delete({ where: { id: user.id } })
    expect(await getRequestUser(req)).toBeNull()
  })
  it('enforces the nonnegative session version constraint', async () => {
    const user = await createUser()
    await expect(prisma.user.update({ where: { id: user.id }, data: { sessionVersion: -1 } })).rejects.toThrow()
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).sessionVersion).toBe(0)
  })
  it('resets a password once, revokes the old cookie and accepts newly authenticated credentials', async () => {
    const user = await createUser()
    const oldRequest = await request(user)
    const token = randomUUID()
    await prisma.user.update({ where: { id: user.id }, data: { resetPasswordToken: token, resetPasswordExpiry: new Date(Date.now() + 60000) } })
    expect((await resetPassword(resetRequest(token))).status).toBe(200)
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(updated.sessionVersion).toBe(1)
    expect(updated.resetPasswordToken).toBeNull()
    expect((await bookings(oldRequest)).status).toBe(401)
    const authorize = authOptions.providers[0].options.authorize
    expect(await authorize({ email: user.email, password })).toBeNull()
    expect(await authorize({ email: user.email, password: 'New-local-password-456' })).toMatchObject({ id: user.id, sessionVersion: 1 })
    expect((await bookings(await request(updated))).status).toBe(200)
    expect((await resetPassword(resetRequest(token))).status).toBe(400)
  })
  it('allows only one concurrent reset to consume the token', async () => {
    const user = await createUser()
    const token = randomUUID()
    await prisma.user.update({ where: { id: user.id }, data: { resetPasswordToken: token, resetPasswordExpiry: new Date(Date.now() + 60000) } })
    const results = await Promise.all([resetPassword(resetRequest(token)), resetPassword(resetRequest(token))])
    expect(results.map(result => result.status).sort()).toEqual([200, 400])
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).sessionVersion).toBe(1)
  })
  it('does not change the version for an expired reset', async () => {
    const user = await createUser()
    const token = randomUUID()
    await prisma.user.update({ where: { id: user.id }, data: { resetPasswordToken: token, resetPasswordExpiry: new Date(Date.now() - 60000) } })
    expect((await resetPassword(resetRequest(token))).status).toBe(400)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).sessionVersion).toBe(0)
  })
  it('revokes a self-deleted account even though its historical user row remains', async () => {
    const user = await createUser()
    const req = await request(user)
    expect((await deleteAccount(req)).status).toBe(200)
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(updated.sessionVersion).toBe(1)
    expect(updated.email).toMatch(/@deleted\.trainr\.local$/)
    expect((await bookings(req)).status).toBe(401)
  })
  it('preserves the admin self-delete restriction', async () => {
    const user = await createUser('ADMIN')
    expect((await deleteAccount(await request(user))).status).toBe(403)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).sessionVersion).toBe(0)
  })
})
