import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'
import type { PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetMs: number
  unavailable?: boolean
}

export function rateLimitKey(key: string, maxRequests: number, windowMs: number) {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error('Rate limit key unavailable')
  if (!key || key.length > 512 || !Number.isInteger(maxRequests) || maxRequests < 1 || maxRequests > 1000 ||
      !Number.isInteger(windowMs) || windowMs < 1000 || windowMs > 86400000) throw new Error('Invalid rate limit policy')
  return createHmac('sha256', secret).update(JSON.stringify(['trainr-rate-limit-v1', key, maxRequests, windowMs])).digest('hex')
}

export async function rateLimit(key: string, maxRequests: number, windowMs: number, database: PrismaClient = prisma): Promise<RateLimitResult> {
  try {
    const keyHash = rateLimitKey(key, maxRequests, windowMs)
    // Separate bounded cleanup avoids holding unrelated bucket locks in the consume transaction.
    await database.$executeRaw`DELETE FROM rate_limit_buckets WHERE "keyHash" IN (
      SELECT "keyHash" FROM rate_limit_buckets WHERE "expiresAt" <= clock_timestamp()
      ORDER BY "expiresAt", "keyHash" LIMIT 100 FOR UPDATE SKIP LOCKED
    )`
    return await database.$transaction(async tx => {
      // The upsert acquires the shared row lock before reading the database clock.
      await tx.$executeRaw`INSERT INTO rate_limit_buckets ("keyHash", hits, "expiresAt")
        VALUES (${keyHash}, ARRAY[]::timestamptz[], clock_timestamp())
        ON CONFLICT ("keyHash") DO UPDATE SET "keyHash" = EXCLUDED."keyHash"`
      const [row] = await tx.$queryRaw<Array<{ hits: Date[]; now: Date }>>`
        SELECT hits, clock_timestamp() AS now FROM rate_limit_buckets WHERE "keyHash" = ${keyHash}`
      const now = row.now.getTime()
      const hits = row.hits.filter(hit => hit.getTime() > now - windowMs)
      const allowed = hits.length < maxRequests
      if (allowed) hits.push(row.now)
      await tx.rateLimitBucket.update({ where: { keyHash }, data: { hits, expiresAt: new Date(hits[hits.length - 1].getTime() + windowMs) } })
      return { allowed, remaining: Math.max(0, maxRequests - hits.length), resetMs: Math.max(1, hits[0].getTime() + windowMs - now) }
    }, { maxWait: 2000, timeout: 5000 })
  } catch {
    console.error('Rate limit persistence unavailable')
    return { allowed: false, remaining: 0, resetMs: 1000, unavailable: true }
  }
}

export function getClientIp(req: { headers: { get(name: string): string | null } }): string {
  // Untrusted headers outside the configured platform share a conservative bucket.
  if (process.env.VERCEL !== '1') return 'unknown'
  const value = req.headers.get('x-vercel-forwarded-for')?.trim() || ''
  const version = isIP(value)
  if (version === 4) return value
  if (version === 6 && !value.includes('%')) return new URL(`http://[${value}]/`).hostname.slice(1, -1)
  return 'unknown'
}
