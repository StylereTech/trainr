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
  it('reads all eleven committed migrations with SHA256 hashes', () => {
    const migrations = migrationManifest()
    expect(migrations).toHaveLength(11)
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
})
