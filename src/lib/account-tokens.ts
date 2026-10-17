import { createHash, createHmac, randomBytes } from 'node:crypto'

export type AccountTokenPurpose = 'verification' | 'reset'

export function hashAccountToken(purpose: AccountTokenPurpose, token: string) {
  return `sha256:v1:${createHash('sha256').update(JSON.stringify(['trainr-account-token-v1', purpose, token])).digest('hex')}`
}

// A database-only disclosure must not reveal a redeemable link or its derivation key.
export function deriveAccountToken(purpose: AccountTokenPurpose, userId: string, seed: string, secret = process.env.NEXTAUTH_SECRET) {
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) throw new Error('Account token key is unavailable')
  if (!/^[a-f0-9]{64}$/.test(seed) || !userId) throw new Error('Invalid account token seed')
  return createHmac('sha256', secret).update(JSON.stringify(['trainr-account-link-v1', purpose, userId, seed])).digest('hex')
}

export function createAccountToken(purpose: AccountTokenPurpose, userId: string) {
  const seed = randomBytes(32).toString('hex')
  const token = deriveAccountToken(purpose, userId, seed)
  return { seed, token, tokenHash: hashAccountToken(purpose, token) }
}
