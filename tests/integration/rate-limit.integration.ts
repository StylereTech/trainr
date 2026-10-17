import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { rateLimit, rateLimitKey } from '@/lib/rate-limit'
import { authOptions } from '@/lib/auth'
import { hash } from 'bcryptjs'

const independent = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL })
const secret = 'synthetic-shared-limit-key-not-for-production'
const keys: string[] = []
let userId = ''
function bucket(max = 3, window = 900000) {
  const key = `synthetic-${randomUUID()}`
  keys.push(rateLimitKey(key, max, window))
  return key
}
beforeAll(async () => {
  expect(await prisma.$queryRaw`SELECT purpose FROM trainr_test_guard`).toEqual([{ purpose: 'disposable integration database' }])
})
beforeEach(() => { vi.stubEnv('NEXTAUTH_SECRET', secret); vi.stubEnv('VERCEL', '1') })
afterEach(async () => {
  await prisma.rateLimitBucket.deleteMany({ where: { keyHash: { in: keys } } })
  if (userId) await prisma.user.delete({ where: { id: userId } })
  userId = ''; keys.length = 0; vi.unstubAllEnvs()
})
afterAll(async () => { await prisma.$disconnect(); await independent.$disconnect() })

it('enforces one sliding budget across concurrent independent database clients', async () => {
  const key = bucket()
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) => rateLimit(key, 3, 900000, i % 2 ? independent : prisma)))
  expect(results.filter(result => result.allowed)).toHaveLength(3)
  expect(results.some(result => result.unavailable)).toBe(false)
  expect(await rateLimit(key, 3, 900000, independent)).toMatchObject({ allowed: false, remaining: 0 })
  const row = await independent.rateLimitBucket.findUniqueOrThrow({ where: { keyHash: keys[0] } })
  expect(row.hits).toHaveLength(3)
  expect(JSON.stringify(row)).not.toContain(key)
})
it('expires only old hits and does not extend a blocked window', async () => {
  const key = bucket(2)
  await rateLimit(key, 2, 900000)
  const [{ now }] = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`
  await prisma.rateLimitBucket.update({ where: { keyHash: keys[0] }, data: { hits: [new Date(now.getTime() - 900001), now], expiresAt: new Date(now.getTime() + 900000) } })
  expect(await rateLimit(key, 2, 900000)).toMatchObject({ allowed: true, remaining: 0 })
  const row = await prisma.rateLimitBucket.findUniqueOrThrow({ where: { keyHash: keys[0] } })
  expect(await rateLimit(key, 2, 900000)).toMatchObject({ allowed: false })
  expect((await prisma.rateLimitBucket.findUniqueOrThrow({ where: { keyHash: keys[0] } })).expiresAt).toEqual(row.expiresAt)
})
it('does not erase long-window limits when a short-window request triggers cleanup', async () => {
  const long = bucket(1), short = bucket(1, 1000)
  await rateLimit(long, 1, 900000)
  expect((await rateLimit(short, 1, 1000)).allowed).toBe(true)
  expect((await rateLimit(long, 1, 900000)).allowed).toBe(false)
})
it('reclaims expired buckets using the database clock', async () => {
  const expired = bucket(1), current = bucket(1)
  await prisma.rateLimitBucket.create({ data: { keyHash: keys[0], hits: [new Date(0)], expiresAt: new Date(1) } })
  expect((await rateLimit(current, 1, 900000)).allowed).toBe(true)
  expect(await prisma.rateLimitBucket.findUnique({ where: { keyHash: rateLimitKey(expired, 1, 900000) } })).toBeNull()
})
it('fails closed and rolls back when bucket persistence is rejected', async () => {
  const key = bucket()
  await prisma.$executeRawUnsafe('ALTER TABLE rate_limit_buckets ADD CONSTRAINT rate_limit_test_failure CHECK (false) NOT VALID')
  try {
    expect(await rateLimit(key, 3, 900000)).toMatchObject({ allowed: false, unavailable: true })
    expect(await prisma.rateLimitBucket.findUnique({ where: { keyHash: keys[0] } })).toBeNull()
  } finally { await prisma.$executeRawUnsafe('ALTER TABLE rate_limit_buckets DROP CONSTRAINT rate_limit_test_failure') }
  expect((await rateLimit(key, 3, 900000)).allowed).toBe(true)
})
it('blocks credential guessing across changing trusted IPs for the same account', async () => {
  const email = `rate-${randomUUID()}@example.test`
  const user = await prisma.user.create({ data: { email, passwordHash: await hash('Correct-password-123', 4), role: 'PARENT' } })
  userId = user.id
  keys.push(rateLimitKey(`login-account:${email}`, 10, 900000))
  const authorize = authOptions.providers[0].options.authorize
  for (let i = 0; i < 11; i++) {
    const ip = `192.0.2.${i + 100}`
    keys.push(rateLimitKey(`login-ip:${ip}`, 30, 900000))
    expect(await authorize({ email: i % 2 ? ` ${email.toUpperCase()} ` : email, password: i === 10 ? 'Correct-password-123' : 'Wrong-password-123' }, { headers: { 'x-vercel-forwarded-for': ip } })).toBeNull()
  }
  const account = await prisma.rateLimitBucket.findUniqueOrThrow({ where: { keyHash: keys[0] } })
  expect(account.hits).toHaveLength(10)
  expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).sessionVersion).toBe(0)
})
