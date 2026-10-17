import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { databaseCheckUrl, loadReadinessEnv, productionEnvErrors, verifyDatabaseQuery, verifyStripeLive } from '../scripts/readiness-checks.mjs'

const validEnv = () => ({
  DATABASE_URL: 'postgresql://synthetic:synthetic@localhost:55439/disposable',
  NEXTAUTH_URL: 'https://trainr.cc', NEXT_PUBLIC_APP_URL: 'https://trainr.cc',
  NEXTAUTH_SECRET: 'synthetic-long-secret-for-validation-only',
  STRIPE_SECRET_KEY: 'sk_live_synthetic', NEXT_PUBLIC_STRIPE_PUBLIC_KEY: 'pk_live_synthetic',
  STRIPE_WEBHOOK_SECRET: 'whsec_synthetic', RESEND_API_KEY: 're_synthetic', EMAIL_FROM: 'test@example.invalid',
})

describe('production readiness configuration', () => {
  it('accepts structurally valid production settings without obsolete fee percentage', () => {
    expect(productionEnvErrors(validEnv())).toEqual([])
  })
  it('requires values without echoing them', () => {
    expect(productionEnvErrors({})).toHaveLength(9)
    const errors = productionEnvErrors({ ...validEnv(), NEXTAUTH_URL: 'https://private.invalid/?secret=do-not-print' })
    expect(errors.join(' ')).not.toContain('do-not-print')
    expect(errors).toHaveLength(1)
  })
  it.each(['sk_test_synthetic', 'sk_live_', 'rk_live_synthetic'])('rejects non-live/unsupported secret %s', (key) => {
    expect(productionEnvErrors({ ...validEnv(), STRIPE_SECRET_KEY: key })).not.toEqual([])
  })
  it('rejects matching test keys instead of calling production ready', () => {
    expect(productionEnvErrors({ ...validEnv(), STRIPE_SECRET_KEY: 'sk_test_synthetic', NEXT_PUBLIC_STRIPE_PUBLIC_KEY: 'pk_test_synthetic' })).toHaveLength(2)
  })
  it('rejects mismatched optional public key, weak auth and placeholders', () => {
    expect(productionEnvErrors({ ...validEnv(), STRIPE_PUBLIC_KEY: 'pk_live_other', NEXTAUTH_SECRET: 'short', STRIPE_WEBHOOK_SECRET: 'whsec_xxx' })).toHaveLength(3)
  })
  it('uses native dotenv parsing and preserves explicit environment precedence', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'trainr-readiness-'))
    try {
      writeFileSync(path.join(dir, '.env.production.local'), 'EXPLICIT=file\nVALUE="quoted # literal"\nPRODUCTION=first\n')
      writeFileSync(path.join(dir, '.env.local'), 'PRODUCTION=second\nLOCAL=local # comment\n')
      writeFileSync(path.join(dir, '.env'), 'LOCAL=base\nBASE=base\n')
      const env: Record<string, string> = { EXPLICIT: 'process' }
      loadReadinessEnv(dir, env)
      expect(env).toEqual({ EXPLICIT: 'process', VALUE: 'quoted # literal', PRODUCTION: 'first', LOCAL: 'local', BASE: 'base' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('read-only Stripe verification', () => {
  it('requires authenticated provider live-mode evidence and bounds requests', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ object: 'balance', livemode: true }) })
    expect(await verifyStripeLive('synthetic', fetcher)).toBeNull()
    expect(fetcher).toHaveBeenCalledWith('https://api.stripe.com/v1/balance', expect.objectContaining({ redirect: 'error', signal: expect.any(AbortSignal) }))
  })
  it.each([{ object: 'balance', livemode: false }, { livemode: true }, null])('rejects unexpected provider response %j', async (body) => {
    expect(await verifyStripeLive('synthetic', vi.fn().mockResolvedValue({ ok: true, json: async () => body }))).not.toBeNull()
  })
  it('does not read or disclose provider error bodies', async () => {
    const text = vi.fn(() => 'private details')
    expect(await verifyStripeLive('synthetic', vi.fn().mockResolvedValue({ ok: false, status: 401, text }))).toBe('Stripe API authentication failed (HTTP 401)')
    expect(text).not.toHaveBeenCalled()
  })
  it('redacts network, timeout and JSON exceptions', async () => {
    expect(await verifyStripeLive('synthetic', vi.fn().mockRejectedValue(new Error('private details')))).not.toContain('private details')
    expect(await verifyStripeLive('synthetic', vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new Error('private details') } }))).not.toContain('private details')
  })
})

describe('database query verification', () => {
  it.each(['', 'https://private.invalid', 'postgresql://localhost', 'not a URL'])('rejects invalid PostgreSQL configuration %s', (url) => {
    expect(databaseCheckUrl(url)).toBeNull()
  })
  it('preserves database identity and SSL while enforcing bounded connection settings', () => {
    const url = new URL(databaseCheckUrl('postgresql://user:password@localhost:5432/db?sslmode=require&schema=public&connect_timeout=0')!)
    expect(url.username).toBe('user')
    expect(url.pathname).toBe('/db')
    expect(url.searchParams.get('sslmode')).toBe('require')
    expect(url.searchParams.get('schema')).toBe('public')
    expect(url.searchParams.get('connect_timeout')).toBe('5')
    expect(url.searchParams.get('socket_timeout')).toBe('10')
  })
  it('requires a successful SQL query, not merely an open port', async () => {
    const client = { $queryRawUnsafe: vi.fn().mockResolvedValue([{ readiness: 1 }]) }
    expect(await verifyDatabaseQuery(client)).toBe(true)
    expect(client.$queryRawUnsafe).toHaveBeenCalledWith('SELECT 1 AS readiness')
    client.$queryRawUnsafe.mockResolvedValue([])
    expect(await verifyDatabaseQuery(client)).toBe(false)
    client.$queryRawUnsafe.mockRejectedValue(new Error('authentication failed'))
    await expect(verifyDatabaseQuery(client)).rejects.toThrow('authentication failed')
  })
})
