import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { databaseCheckUrl, loadReadinessEnv, missingDatabaseColumns, paymentIntegrityIssues, productionEnvErrors, readMigrationLedger, readPaymentIntegrity, verifyDatabaseQuery, verifyStripeLive } from '../scripts/readiness-checks.mjs'

const validEnv = () => ({
  DATABASE_URL: 'postgresql://synthetic:synthetic@localhost:55439/disposable',
  NEXTAUTH_URL: 'https://trainr.cc', NEXT_PUBLIC_APP_URL: 'https://trainr.cc',
  NEXTAUTH_SECRET: 'synthetic-long-secret-for-validation-only',
  STRIPE_SECRET_KEY: 'sk_live_synthetic', NEXT_PUBLIC_STRIPE_PUBLIC_KEY: 'pk_live_synthetic',
  STRIPE_WEBHOOK_SECRET: 'whsec_synthetic', STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_connect_synthetic',
  RESEND_API_KEY: 're_synthetic', EMAIL_FROM: 'test@example.invalid',
})

describe('production readiness configuration', () => {
  it('accepts structurally valid production settings without obsolete fee percentage', () => {
    expect(productionEnvErrors(validEnv())).toEqual([])
  })
  it('requires values without echoing them', () => {
    expect(productionEnvErrors({})).toHaveLength(10)
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
  it('requires an independent Connect webhook signing secret', () => {
    expect(productionEnvErrors({ ...validEnv(), STRIPE_CONNECT_WEBHOOK_SECRET: '' })).toContain('STRIPE_CONNECT_WEBHOOK_SECRET is missing')
    expect(productionEnvErrors({ ...validEnv(), STRIPE_CONNECT_WEBHOOK_SECRET: 'invalid' })).toContain('STRIPE_CONNECT_WEBHOOK_SECRET has an invalid format')
    expect(productionEnvErrors({ ...validEnv(), STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_synthetic' })).toContain('Stripe platform and Connect webhook secrets must be distinct')
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

describe('read-only schema column verification', () => {
  const models = [
    { name: 'Payment', dbName: 'payments', fields: [
      { name: 'id', kind: 'scalar' },
      { name: 'stripeCheckoutSessionId', kind: 'scalar' },
      { name: 'booking', kind: 'object' },
    ] },
    { name: 'Booking', dbName: 'bookings', fields: [{ name: 'date', dbName: 'booking_date', kind: 'scalar' }] },
  ]

  it('detects missing payment columns while respecting mapped names and excluding relations', async () => {
    const client = { $queryRawUnsafe: vi.fn().mockResolvedValue([
      { table_name: 'payments', column_name: 'id' },
      { table_name: 'bookings', column_name: 'booking_date' },
    ]) }
    expect(await missingDatabaseColumns(client, models)).toEqual(['payments.stripeCheckoutSessionId'])
    expect(client.$queryRawUnsafe).toHaveBeenCalledWith(
      'SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = $1', 'public')
  })

  it('passes only when every expected column is present in the chosen schema', async () => {
    const client = { $queryRawUnsafe: vi.fn().mockResolvedValue([
      { table_name: 'payments', column_name: 'id' },
      { table_name: 'payments', column_name: 'stripeCheckoutSessionId' },
      { table_name: 'bookings', column_name: 'booking_date' },
    ]) }
    expect(await missingDatabaseColumns(client, models, 'trainr')).toEqual([])
    expect(client.$queryRawUnsafe).toHaveBeenCalledWith(expect.any(String), 'trainr')
  })

  it('fails closed on a malformed inspection result', async () => {
    const client = { $queryRawUnsafe: vi.fn().mockResolvedValue([{ table_name: 'payments' }]) }
    await expect(missingDatabaseColumns(client, models)).rejects.toThrow('Invalid schema inspection response')
  })
})

describe('read-only migration ledger query', () => {
  it('queries only Prisma migration metadata in the configured schema', async () => {
    const rows = [{ migration_name: '0_baseline', checksum: 'synthetic', finished_at: new Date(), rolled_back_at: null }]
    const client = { $queryRawUnsafe: vi.fn().mockResolvedValue(rows) }
    expect(await readMigrationLedger(client, 'trainr-audit')).toBe(rows)
    expect(client.$queryRawUnsafe).toHaveBeenCalledWith(
      'SELECT migration_name, checksum, finished_at, rolled_back_at FROM "trainr-audit"."_prisma_migrations"')
  })

  it('quotes schema identifiers and rejects invalid names without querying', async () => {
    const client = { $queryRawUnsafe: vi.fn().mockResolvedValue([]) }
    await readMigrationLedger(client, 'audit"schema')
    expect(client.$queryRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('FROM "audit""schema"."_prisma_migrations"'))
    client.$queryRawUnsafe.mockClear()
    for (const schema of ['', 'a\0b', 'a'.repeat(64)]) {
      await expect(readMigrationLedger(client, schema)).rejects.toThrow('Invalid migration schema')
    }
    expect(client.$queryRawUnsafe).not.toHaveBeenCalled()
  })
})

describe('read-only payment integrity preflight', () => {
  const clean = { positiveTerminal: 1, missingProviderReceipt: 0, missingSettlementVerification: 0,
    openFinancialReview: 0, missingBookingOrAmountMismatch: 0, invalidPaymentAmounts: 0, invalidBookingAmounts: 0,
    positivePackageTerminal: 1, missingPackageProviderReceipt: 0, missingPackageSettlementVerification: 0,
    missingPackageSuccessReceipt: 0, openPackageFinancialReview: 0, invalidPackageAmounts: 0,
    duplicateTerminalProviderIds: 0 }

  it('accepts an aggregate-only clean result and scopes the query to the configured schema', async () => {
    const client = { $queryRawUnsafe: vi.fn().mockResolvedValue([clean]) }
    expect(await readPaymentIntegrity(client, 'audit"schema')).toEqual(clean)
    const sql = client.$queryRawUnsafe.mock.calls[0][0]
    expect(sql).toContain('"audit""schema"."payments"')
    expect(sql).toContain('"audit""schema"."bookings"')
    expect(sql).toContain('p."stripePaymentIntentId" IS NULL OR p."stripeChargeId" IS NULL')
    expect(sql).toContain('"audit""schema"."package_purchases"')
    expect(sql).toContain('"audit""schema"."package_payment_receipts"')
    expect(sql).toContain('GROUP BY kind, provider_id HAVING count(*) > 1')
    expect(sql).toContain('"duplicateTerminalProviderIds"')
    expect(paymentIntegrityIssues(clean)).toEqual([])
  })

  it('fails a positive succeeded legacy payment lacking provider IDs and settlement proof', () => {
    expect(paymentIntegrityIssues({ ...clean, positiveTerminal: 19, missingProviderReceipt: 19,
      missingSettlementVerification: 19 })).toEqual([
      '19 positive settled payments lack complete Stripe Checkout, intent, charge or transfer IDs',
      '19 positive settled payments lack settlement verification',
    ])
  })

  it('also flags amount drift and an open financial review without printing any row', () => {
    expect(paymentIntegrityIssues({ ...clean, openFinancialReview: 1, missingBookingOrAmountMismatch: 2,
      invalidPaymentAmounts: 3, invalidBookingAmounts: 4 })).toHaveLength(4)
  })

  it('holds a paid package without provider or signed-success receipts', () => {
    expect(paymentIntegrityIssues({ ...clean, missingPackageProviderReceipt: 1,
      missingPackageSettlementVerification: 1, missingPackageSuccessReceipt: 1 })).toEqual([
      '1 positive settled packages lack complete Stripe Checkout, intent, charge or transfer IDs',
      '1 positive settled packages lack settlement verification',
      '1 positive settled packages lack a matching signed-success receipt',
    ])
  })

  it('holds when settled bookings and packages share Stripe provider identities', () => {
    expect(paymentIntegrityIssues({ ...clean, duplicateTerminalProviderIds: 2 })).toEqual([
      '2 Stripe provider IDs are shared by multiple settled bookings or packages',
    ])
  })

  it('rejects malformed aggregates and schema names before trusting the result', async () => {
    const client = { $queryRawUnsafe: vi.fn().mockResolvedValue([{ ...clean, missingProviderReceipt: -1 }]) }
    await expect(readPaymentIntegrity(client)).rejects.toThrow('Invalid payment integrity response')
    client.$queryRawUnsafe.mockClear()
    await expect(readPaymentIntegrity(client, 'bad\0schema')).rejects.toThrow('Invalid migration schema')
    expect(client.$queryRawUnsafe).not.toHaveBeenCalled()
  })
})
