import { afterEach, expect, it, vi } from 'vitest'
import { createAccountToken, deriveAccountToken, hashAccountToken } from '@/lib/account-tokens'

const secret = 'synthetic-account-token-key-never-for-production'
afterEach(() => vi.unstubAllEnvs())

it('stores a purpose-separated digest and a seed, neither of which is the bearer token', () => {
  vi.stubEnv('NEXTAUTH_SECRET', secret)
  const value = createAccountToken('reset', 'user-1')
  expect(value.token).toMatch(/^[a-f0-9]{64}$/)
  expect(value.seed).toMatch(/^[a-f0-9]{64}$/)
  expect(value.tokenHash).toMatch(/^sha256:v1:[a-f0-9]{64}$/)
  expect(value.token).not.toBe(value.seed)
  expect(value.tokenHash).not.toContain(value.token)
  expect(hashAccountToken('reset', value.seed)).not.toBe(value.tokenHash)
  expect(hashAccountToken('verification', value.token)).not.toBe(value.tokenHash)
  expect(deriveAccountToken('reset', 'user-1', value.seed)).toBe(value.token)
  expect(createAccountToken('reset', 'user-1').token).not.toBe(value.token)
})

it('binds derivation to the server secret, purpose, user and random seed', () => {
  const seed = 'a'.repeat(64)
  const token = deriveAccountToken('reset', 'user-1', seed, secret)
  expect(deriveAccountToken('verification', 'user-1', seed, secret)).not.toBe(token)
  expect(deriveAccountToken('reset', 'user-2', seed, secret)).not.toBe(token)
  expect(deriveAccountToken('reset', 'user-1', 'b'.repeat(64), secret)).not.toBe(token)
  expect(deriveAccountToken('reset', 'user-1', seed, secret + '-rotated')).not.toBe(token)
})

it.each(['', 'short', 'x'.repeat(31)])('fails closed without a sufficiently long server key: %s', key => {
  expect(() => deriveAccountToken('reset', 'user-1', 'a'.repeat(64), key)).toThrow('key is unavailable')
})

it.each(['', 'not-hex', 'a'.repeat(63)])('rejects invalid persisted seeds: %s', seed => {
  expect(() => deriveAccountToken('verification', 'user-1', seed, secret)).toThrow('Invalid account token seed')
})
