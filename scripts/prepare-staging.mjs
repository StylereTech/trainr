import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const STAGING_DATABASE = 'trainr-audit-staging-20261009'
export const STAGING_PROJECT = 'steep-field-81581985'
export const STAGING_BRANCH = 'codex/payment-readiness-20261006'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function requireCondition(condition, code) {
  if (!condition) throw new Error(code)
}

export function stagingConfig(env) {
  if (!env.TRAINR_STAGING_INIT) return null
  requireCondition(env.TRAINR_STAGING_INIT === STAGING_DATABASE, 'STAGING_OPT_IN_INVALID')
  requireCondition(env.VERCEL_ENV === 'preview', 'STAGING_PREVIEW_REQUIRED')
  requireCondition(env.VERCEL_GIT_COMMIT_REF === STAGING_BRANCH, 'STAGING_BRANCH_REQUIRED')
  requireCondition(env.STRIPE_SECRET_KEY?.startsWith('sk_test_'), 'STAGING_TEST_SECRET_REQUIRED')
  requireCondition(env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY?.startsWith('pk_test_'), 'STAGING_TEST_PUBLIC_KEY_REQUIRED')
  const parse = (value) => {
    let url
    try { url = new URL(value) } catch { throw new Error('STAGING_DATABASE_URL_INVALID') }
    requireCondition(['postgres:', 'postgresql:'].includes(url.protocol)
      && url.hostname.endsWith('.neon.tech') && url.username === 'neondb_owner'
      && url.password && url.pathname === '/neondb'
      && (!url.port || url.port === '5432')
      && ['require', 'verify-full'].includes(url.searchParams.get('sslmode'))
      && (!url.searchParams.has('schema') || url.searchParams.get('schema') === 'public'),
    'STAGING_DATABASE_URL_INVALID')
    return url
  }
  const pooled = parse(env.DATABASE_URL)
  const direct = parse(env.DATABASE_URL_UNPOOLED || env.DATABASE_URL)
  requireCondition(pooled.hostname.replace('-pooler.', '.') === direct.hostname.replace('-pooler.', '.')
    && pooled.username === direct.username && pooled.password === direct.password,
  'STAGING_DATABASE_URL_MISMATCH')
  return { url: direct.href }
}

export function migrationManifest(base = root) {
  const directory = resolve(base, 'prisma/migrations')
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => ({
      name: entry.name,
      checksum: createHash('sha256').update(readFileSync(resolve(directory, entry.name, 'migration.sql'))).digest('hex'),
    })).sort((a, b) => a.name.localeCompare(b.name))
}

export function verifyMigrationLedger(rows, manifest) {
  requireCondition(rows.length === manifest.length, 'STAGING_MIGRATION_COUNT_MISMATCH')
  for (const migration of manifest) {
    const rowsForName = rows.filter((row) => row.migration_name === migration.name)
    requireCondition(rowsForName.length === 1 && rowsForName[0].checksum === migration.checksum
      && rowsForName[0].finished_at && !rowsForName[0].rolled_back_at,
    'STAGING_MIGRATION_HISTORY_INVALID')
  }
}

export function deployMigrations(url, env, exec = execFileSync) {
  try {
    exec(process.execPath, [resolve(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], {
      cwd: root, env: { ...env, DATABASE_URL: url }, timeout: 120000,
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch {
    // Provider/CLI diagnostics can contain connection credentials. Never echo them.
    throw new Error('STAGING_MIGRATION_DEPLOY_FAILED')
  }
}

export async function initializeStaging(db, manifest, deploy) {
  return db.$transaction(async (tx) => {
    const [lock] = await tx.$queryRawUnsafe('SELECT pg_try_advisory_xact_lock(20261009, 81581985) AS acquired')
    requireCondition(lock?.acquired === true, 'STAGING_INITIALIZER_BUSY')
    const marker = await tx.$queryRawUnsafe('SELECT resource_name, project_id FROM trainr_audit_guard.ownership')
    requireCondition(marker.length === 1 && marker[0].resource_name === STAGING_DATABASE
      && marker[0].project_id === STAGING_PROJECT, 'STAGING_OWNERSHIP_REQUIRED')
    const [state] = await tx.$queryRawUnsafe("SELECT count(*)::int AS table_count FROM information_schema.tables WHERE table_schema = 'public'")
    if (state.table_count === 0) await deploy()
    const ledger = await tx.$queryRawUnsafe('SELECT migration_name, checksum, finished_at, rolled_back_at FROM public._prisma_migrations')
    verifyMigrationLedger(ledger, manifest)
    return state.table_count === 0 ? 'initialized' : 'verified'
  }, { maxWait: 10000, timeout: 150000 })
}

async function main() {
  const config = stagingConfig(process.env)
  if (!config) return
  const { PrismaClient } = await import('@prisma/client')
  const db = new PrismaClient({ datasources: { db: { url: config.url } } })
  try {
    const status = await initializeStaging(db, migrationManifest(), () => deployMigrations(config.url, process.env))
    console.log(`Audit staging schema ${status}; migration checksums verified.`)
  } finally {
    await db.$disconnect()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    const code = /^STAGING_[A-Z_]+$/.test(error?.message) ? error.message : 'STAGING_INITIALIZATION_FAILED'
    console.error(code)
    process.exitCode = 1
  })
}
