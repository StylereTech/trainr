import { describe, expect, it, vi } from 'vitest'
import {
  STAGING_BRANCH, STAGING_DATABASE, STAGING_PROJECT, stagingConfig,
  migrationManifest, verifyMigrationLedger, deployMigrations, initializeStaging,
} from '../scripts/prepare-staging.mjs'

const env = {
  TRAINR_STAGING_INIT: STAGING_DATABASE, VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: STAGING_BRANCH,
  STRIPE_SECRET_KEY: 'sk_test_synthetic', NEXT_PUBLIC_STRIPE_PUBLIC_KEY: 'pk_test_synthetic',
  DATABASE_URL: 'postgresql://neondb_owner:synthetic@ep-synthetic-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require',
  DATABASE_URL_UNPOOLED: 'postgresql://neondb_owner:synthetic@ep-synthetic.us-east-1.aws.neon.tech/neondb?sslmode=require',
}
const manifest = [{ name: '0_baseline', checksum: 'synthetic-checksum' }]
const ledger = [{ migration_name: '0_baseline', checksum: 'synthetic-checksum', finished_at: new Date(), rolled_back_at: null }]
function database({ owned = true, count = 0, rows = ledger, locked = true } = {}) {
  const query = vi.fn().mockResolvedValueOnce([{ acquired: locked }])
    .mockResolvedValueOnce(owned ? [{ resource_name: STAGING_DATABASE, project_id: STAGING_PROJECT }] : [])
    .mockResolvedValueOnce([{ table_count: count }]).mockResolvedValueOnce(rows)
  return { $transaction: vi.fn(async (fn) => fn({ $queryRawUnsafe: query })), query }
}

describe('isolated audit preview initializer', () => {
  it('is inert without opt-in, including ordinary production builds', () => {
    expect(stagingConfig({ VERCEL_ENV: 'production' })).toBeNull()
  })
  it('uses the direct connection for the same isolated database', () => {
    expect(stagingConfig(env)).toEqual({ url: env.DATABASE_URL_UNPOOLED })
  })
  it.each([
    ['TRAINR_STAGING_INIT', 'anything'], ['VERCEL_ENV', 'production'],
    ['VERCEL_GIT_COMMIT_REF', 'main'], ['STRIPE_SECRET_KEY', 'sk_live_synthetic'],
    ['NEXT_PUBLIC_STRIPE_PUBLIC_KEY', 'pk_live_synthetic'], ['DATABASE_URL', 'not-a-url'],
    ['DATABASE_URL', env.DATABASE_URL.replace('sslmode=require', 'sslmode=disable')],
    ['DATABASE_URL', env.DATABASE_URL.replace('.neon.tech', '.neon.tech.attacker.example')],
    ['DATABASE_URL', env.DATABASE_URL + '&schema=other'],
    ['DATABASE_URL_UNPOOLED', env.DATABASE_URL_UNPOOLED.replace('ep-synthetic.', 'ep-other.')],
  ])('rejects unsafe configuration: %s=%s', (key, value) => {
    expect(() => stagingConfig({ ...env, [key]: value })).toThrow(/^STAGING_/)
  })
  it('requires an ownership marker before any writes', async () => {
    const deploy = vi.fn()
    await expect(initializeStaging(database({ owned: false }), manifest, deploy)).rejects.toThrow('STAGING_OWNERSHIP_REQUIRED')
    expect(deploy).not.toHaveBeenCalled()
  })
  it('rejects overlapping initializers', async () => {
    const deploy = vi.fn()
    await expect(initializeStaging(database({ locked: false }), manifest, deploy)).rejects.toThrow('STAGING_INITIALIZER_BUSY')
    expect(deploy).not.toHaveBeenCalled()
  })
  it('initializes an owned empty public schema and verifies migration history', async () => {
    const deploy = vi.fn()
    await expect(initializeStaging(database(), manifest, deploy)).resolves.toBe('initialized')
    expect(deploy).toHaveBeenCalledOnce()
  })
  it('does not replay migrations on an existing database', async () => {
    const deploy = vi.fn()
    await expect(initializeStaging(database({ count: 30 }), manifest, deploy)).resolves.toBe('verified')
    expect(deploy).not.toHaveBeenCalled()
  })
  it('rejects unknown nonempty databases without mutating them', async () => {
    const deploy = vi.fn()
    await expect(initializeStaging(database({ count: 1, rows: [] }), manifest, deploy)).rejects.toThrow('STAGING_MIGRATION_COUNT_MISMATCH')
    expect(deploy).not.toHaveBeenCalled()
  })
  it.each([
    { checksum: 'wrong' }, { finished_at: null }, { rolled_back_at: new Date() }, { migration_name: 'unknown' },
  ])('rejects modified or incomplete migrations %j', (change) => {
    expect(() => verifyMigrationLedger([{ ...ledger[0], ...change }], manifest)).toThrow('STAGING_MIGRATION_HISTORY_INVALID')
  })
  it('rejects duplicate migration records', () => {
    expect(() => verifyMigrationLedger([...ledger, ...ledger], manifest)).toThrow('STAGING_MIGRATION_COUNT_MISMATCH')
  })
  it('reads all twenty committed migrations with SHA256 hashes', () => {
    const migrations = migrationManifest()
    expect(migrations).toHaveLength(20)
    expect(migrations.every((migration) => /^[a-f0-9]{64}$/.test(migration.checksum))).toBe(true)
  })
  it('runs only migrate deploy with the guarded connection and captures diagnostics', () => {
    const exec = vi.fn()
    deployMigrations(env.DATABASE_URL_UNPOOLED, env, exec)
    expect(exec).toHaveBeenCalledWith(process.execPath, expect.arrayContaining(['migrate', 'deploy']), expect.objectContaining({
      env: expect.objectContaining({ DATABASE_URL: env.DATABASE_URL_UNPOOLED }), stdio: ['ignore', 'pipe', 'pipe'],
    }))
  })
  it('does not expose credentials in CLI failures', () => {
    expect(() => deployMigrations(env.DATABASE_URL, env, () => { throw new Error(env.DATABASE_URL) }))
      .toThrow('STAGING_MIGRATION_DEPLOY_FAILED')
  })
  const upgrade = { name: '20261011080000_add_trainer_time_zone', checksum: 'reviewed-upgrade' }
  const upgradedLedger = [...ledger, { ...ledger[0], migration_name: upgrade.name, checksum: upgrade.checksum }]
  it('applies only an approved trailing migration after verifying existing checksums', async () => {
    const db = database({ count: 30 })
    db.query.mockResolvedValueOnce(upgradedLedger)
    const deploy = vi.fn()
    await expect(initializeStaging(db, [...manifest, upgrade], deploy)).resolves.toBe('upgraded')
    expect(deploy).toHaveBeenCalledOnce()
  })
  it('allows the rehearsed additive package purchase snapshot migration in the owned Preview only', async () => {
    const migration = { name: '20261011193000_add_package_purchase_snapshots', checksum: 'reviewed-package-snapshot' }
    const db = database({ count: 30 })
    db.query.mockResolvedValueOnce([...ledger, { ...ledger[0], migration_name: migration.name, checksum: migration.checksum }])
    const deploy = vi.fn()
    await expect(initializeStaging(db, [...manifest, migration], deploy)).resolves.toBe('upgraded')
    expect(deploy).toHaveBeenCalledOnce()
    expect(() => stagingConfig({ ...env, VERCEL_ENV: 'production' })).toThrow('STAGING_PREVIEW_REQUIRED')
  })
  it('allows only the reviewed package checkout upgrade on the guarded Preview', async () => {
    const migration = { name: '20261011200000_add_package_checkout_attempts', checksum: 'reviewed-package-checkout' }
    const db = database({ count: 31 })
    db.query.mockResolvedValueOnce([...ledger, { ...ledger[0], migration_name: migration.name, checksum: migration.checksum }])
    const deploy = vi.fn()
    await expect(initializeStaging(db, [...manifest, migration], deploy)).resolves.toBe('upgraded')
    expect(deploy).toHaveBeenCalledOnce()
    expect(() => stagingConfig({ ...env, VERCEL_GIT_COMMIT_REF: 'main' })).toThrow('STAGING_BRANCH_REQUIRED')
  })
  it('verifies the completed ledger after an upgrade', async () => {
    const db = database({ count: 30 })
    db.query.mockResolvedValueOnce(ledger)
    await expect(initializeStaging(db, [...manifest, upgrade], vi.fn())).rejects.toThrow('STAGING_MIGRATION_COUNT_MISMATCH')
  })
  it('allows the rehearsed package refund ledger only on the guarded Preview', async () => {
    const migration = { name: '20261011210000_add_package_refund_history', checksum: 'reviewed-package-refunds' }
    const db = database({ count: 32 })
    db.query.mockResolvedValueOnce([...ledger, { ...ledger[0], migration_name: migration.name, checksum: migration.checksum }])
    const deploy = vi.fn()
    await expect(initializeStaging(db, [...manifest, migration], deploy)).resolves.toBe('upgraded')
    expect(deploy).toHaveBeenCalledOnce()
    expect(() => stagingConfig({ ...env, VERCEL_ENV: 'production' })).toThrow('STAGING_PREVIEW_REQUIRED')
    expect(() => stagingConfig({ ...env, VERCEL_GIT_COMMIT_REF: 'main' })).toThrow('STAGING_BRANCH_REQUIRED')
  })
  it('does not upgrade modified history', async () => {
    const deploy = vi.fn()
    await expect(initializeStaging(database({ count: 30, rows: [{ ...ledger[0], checksum: 'changed' }] }), [...manifest, upgrade], deploy)).rejects.toThrow('STAGING_MIGRATION_HISTORY_INVALID')
    expect(deploy).not.toHaveBeenCalled()
  })
  it('allows booking review columns only in the guarded audit Preview', async () => {
    const migration = { name: '20261012070000_add_booking_payment_review', checksum: 'reviewed-payment-hold' }
    const db = database({ count: 32 })
    db.query.mockResolvedValueOnce([...ledger, { ...ledger[0], migration_name: migration.name, checksum: migration.checksum }])
    const deploy = vi.fn()
    await expect(initializeStaging(db, [...manifest, migration], deploy)).resolves.toBe('upgraded')
    expect(deploy).toHaveBeenCalledOnce()
    expect(() => stagingConfig({ ...env, VERCEL_ENV: 'production' })).toThrow('STAGING_PREVIEW_REQUIRED')
  })
  it('refuses migrations not explicitly approved for this audit database', async () => {
    const deploy = vi.fn()
    await expect(initializeStaging(database({ count: 30 }), [...manifest, { ...upgrade, name: 'unreviewed' }], deploy)).rejects.toThrow('STAGING_UPGRADE_NOT_APPROVED')
    expect(deploy).not.toHaveBeenCalled()
  })
  it('allows credit grant history only in the guarded audit Preview', async () => {
    const migration = { name: '20261012080000_add_package_credit_grants', checksum: 'reviewed-credit-grants' }
    const db = database({ count: 33 })
    db.query.mockResolvedValueOnce([...ledger, { ...ledger[0], migration_name: migration.name, checksum: migration.checksum }])
    const deploy = vi.fn()
    await expect(initializeStaging(db, [...manifest, migration], deploy)).resolves.toBe('upgraded')
    expect(deploy).toHaveBeenCalledOnce()
    expect(() => stagingConfig({ ...env, VERCEL_ENV: 'production' })).toThrow('STAGING_PREVIEW_REQUIRED')
    expect(() => stagingConfig({ ...env, VERCEL_GIT_COMMIT_REF: 'main' })).toThrow('STAGING_BRANCH_REQUIRED')
  })
  it('allows the account closure queue only in the guarded audit Preview', async () => {
    const migration = { name: '20261012090000_add_account_checkout_closures', checksum: 'reviewed-account-closure-queue' }
    const db = database({ count: 34 })
    db.query.mockResolvedValueOnce([...ledger, { ...ledger[0], migration_name: migration.name, checksum: migration.checksum }])
    await expect(initializeStaging(db, [...manifest, migration], vi.fn())).resolves.toBe('upgraded')
    expect(() => stagingConfig({ ...env, VERCEL_ENV: 'production' })).toThrow('STAGING_PREVIEW_REQUIRED')
    expect(() => stagingConfig({ ...env, VERCEL_GIT_COMMIT_REF: 'main' })).toThrow('STAGING_BRANCH_REQUIRED')
  })
  it('allows the closure proof correction only after the same staging guards', async () => {
    const migration = { name: '20261012090100_require_checkout_closure_proof', checksum: 'reviewed-closure-proof' }
    const db = database({ count: 34 })
    db.query.mockResolvedValueOnce([...ledger, { ...ledger[0], migration_name: migration.name, checksum: migration.checksum }])
    await expect(initializeStaging(db, [...manifest, migration], vi.fn())).resolves.toBe('upgraded')
    expect(() => stagingConfig({ ...env, VERCEL_ENV: 'production' })).toThrow('STAGING_PREVIEW_REQUIRED')
  })
})
