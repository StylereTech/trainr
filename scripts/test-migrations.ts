import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { verifyDatabaseTarget } from '../tests/integration/database-target'

const root = resolve(__dirname, '..')
const schema = resolve(root, 'prisma/schema.prisma')
const directory = resolve(root, 'prisma/migrations')
const initial = resolve(directory, '0_baseline/migration.sql')
const phoneMigration = '20260501210000_add_trainer_phone_leads'
const seededTables = ['users', 'parent_profiles', 'trainer_profiles', 'athlete_profiles', 'sports', 'service_offerings', 'bookings', 'payments', 'notifications', 'trainer_wallets', 'wallet_entries', 'withdrawal_requests']

function cli(url: string, label: string, args: string[], expectedStatus = 0, expectedText?: RegExp) {
  let output = '', status = 0
  try {
    output = execFileSync(process.execPath, [resolve(root, 'node_modules/prisma/build/index.js'), ...args], {
      cwd: root, env: { ...process.env, DATABASE_URL: url }, timeout: 120000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    const failure = error as { status?: number; stdout?: Buffer; stderr?: Buffer }
    status = failure.status ?? -1
    output = String(failure.stdout ?? '') + String(failure.stderr ?? '')
  }
  if (status !== expectedStatus || (expectedText && !expectedText.test(output))) {
    // Schema diffs contain no rows; other CLI failures are reported by code, not connection diagnostics.
    if (args[1] === 'diff') console.error(output)
    throw new Error(`${label} failed (exit ${status}, ${output.match(/\bP\d{4}\b/)?.[0] ?? 'no Prisma code'})`)
  }
  console.log(`PASS: ${label}`)
}

async function snapshot(client: PrismaClient) {
  const result: Record<string, unknown> = {}
  for (const table of seededTables) {
    const rows = await client.$queryRawUnsafe<Array<{ row: Record<string, unknown> }>>(`SELECT row_to_json(t) AS row FROM "${table}" t ORDER BY id`)
    result[table] = rows.map(({ row }) => {
      if (table === 'users') for (const key of ['sessionVersion', 'deletedAt', 'verificationTokenSeed', 'resetPasswordTokenSeed', 'verificationToken', 'verificationExpiry', 'resetPasswordToken', 'resetPasswordExpiry']) delete row[key]
      if (table === 'payments') for (const key of ['refundPendingAmountInCents', 'refundFailedCount', 'refundsVerifiedAt']) delete row[key]
      return row
    })
  }
  return result
}

async function verifyHistory(client: PrismaClient) {
  const migrations = readdirSync(directory, { withFileTypes: true }).filter(item => item.isDirectory()).map(item => item.name).sort()
  const applied = await client.$queryRaw<Array<{ migration_name: string; checksum: string; finished_at: Date | null; rolled_back_at: Date | null }>>`
    SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY migration_name`
  assert.deepEqual(applied.map(row => row.migration_name), migrations)
  for (const row of applied) {
    assert(row.finished_at && !row.rolled_back_at)
    assert.equal(row.checksum, createHash('sha256').update(readFileSync(resolve(directory, row.migration_name, 'migration.sql'))).digest('hex'))
  }
  const constraints = await client.$queryRaw<Array<{ conname: string }>>`
    SELECT conname FROM pg_constraint WHERE conname IN ('checkout_attempts_sequence_positive', 'users_sessionVersion_nonnegative',
      'payments_refund_pending_nonnegative', 'payments_refund_failed_nonnegative', 'rate_limit_buckets_hash_format', 'rate_limit_buckets_bounded_hits')`
  assert.equal(constraints.length, 6)
  const indexes = await client.$queryRaw<Array<{ indexdef: string }>>`
    SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'checkout_attempts_one_active_payment'`
  assert.equal(indexes.length, 1)
  assert.match(indexes[0].indexdef, /UNIQUE.*WHERE.*retiredAt.*IS NULL/)
  console.log(`PASS: ${migrations.length} migration checksums, completion records and SQL-only safeguards`)
}

async function main() {
  if (process.argv.slice(2).some(arg => arg !== '--integration')) throw new Error('Only --integration is supported')
  const source = verifyDatabaseTarget(process.env.TEST_DATABASE_URL, process.env.TRAINR_ALLOW_DB_TESTS)
  const admin = new PrismaClient({ datasourceUrl: source })
  const tag = `trainr-migration-rehearsal-${randomUUID()}`
  const created: string[] = []
  const clients: PrismaClient[] = []
  try {
    assert.deepEqual(await admin.$queryRaw`SELECT purpose FROM trainr_test_guard`, [{ purpose: 'disposable integration database' }])
    for (const mode of ['fresh', 'legacy', 'phone_history']) {
      const name = `trainr_audit_migration_${randomUUID().replaceAll('-', '').slice(0, 12)}_${mode}`
      assert.match(name, /^trainr_audit_migration_[a-f0-9]{12}_(fresh|legacy|phone_history)$/)
      await admin.$executeRawUnsafe(`CREATE DATABASE "${name}" OWNER trainr_test`)
      created.push(name)
      await admin.$executeRawUnsafe(`COMMENT ON DATABASE "${name}" IS '${tag}'`)
      const target = new URL(source); target.pathname = `/${name}`
      const url = verifyDatabaseTarget(target.href, '1')
      const client = new PrismaClient({ datasourceUrl: url }); clients.push(client)
      let before: Record<string, unknown> | undefined
      let phoneBefore: unknown
      if (mode !== 'fresh') {
        cli(url, `${mode}: install historical schema`, ['db', 'execute', '--file', initial, '--schema', schema])
        cli(url, `${mode}: insert synthetic legacy history`, ['db', 'execute', '--file', resolve(root, 'tests/integration/fixtures/migration-legacy.sql'), '--schema', schema])
        before = await snapshot(client)
        if (mode === 'legacy') cli(url, 'nonempty database refuses unreviewed deploy', ['migrate', 'deploy', '--schema', schema], 1, /P3005/)
        if (mode === 'phone_history') {
          cli(url, 'existing phone schema', ['db', 'execute', '--file', resolve(directory, phoneMigration, 'migration.sql'), '--schema', schema])
          await client.$executeRaw`INSERT INTO trainer_phone_leads (id, "trainerProfileId", summary) VALUES ('legacy-lead', 'legacy-trainer-profile', 'Synthetic lead')`
          phoneBefore = await client.trainerPhoneLead.findMany()
          cli(url, 'existing recorded phone migration', ['migrate', 'resolve', '--applied', phoneMigration, '--schema', schema])
        }
        cli(url, `${mode}: baseline after known fixture comparison`, ['migrate', 'resolve', '--applied', '0_baseline', '--schema', schema])
      }
      cli(url, `${mode}: full migration deployment`, ['migrate', 'deploy', '--schema', schema])
      await verifyHistory(client)
      cli(url, `${mode}: schema parity`, ['migrate', 'diff', '--from-url', url, '--to-schema-datamodel', schema, '--exit-code'])
      cli(url, `${mode}: replay is a no-op`, ['migrate', 'deploy', '--schema', schema], 0, /No pending migrations to apply/)
      if (before) {
        assert.deepEqual(await snapshot(client), before)
        const user = await client.user.findUniqueOrThrow({ where: { id: 'legacy-parent' } })
        assert.equal(user.sessionVersion, 0); assert.equal(user.deletedAt, null)
        for (const value of [user.verificationToken, user.verificationExpiry, user.resetPasswordToken, user.resetPasswordExpiry, user.verificationTokenSeed, user.resetPasswordTokenSeed]) assert.equal(value, null)
        const payment = await client.payment.findUniqueOrThrow({ where: { id: 'legacy-payment' } })
        assert.equal(payment.refundPendingAmountInCents, 0); assert.equal(payment.refundFailedCount, 0); assert.equal(payment.refundsVerifiedAt, null)
        assert.equal(await client.checkoutAttempt.count(), 0); assert.equal(await client.paymentRefund.count(), 0)
        if (phoneBefore) assert.deepEqual(await client.trainerPhoneLead.findMany(), phoneBefore)
        console.log(`PASS: ${mode}: all 12 legacy tables preserved; only intended token revocation/defaults changed`)
      }
      if (mode === 'fresh' && process.argv.includes('--integration')) {
        await client.$executeRaw`CREATE TABLE trainr_test_guard (purpose TEXT NOT NULL)`
        await client.$executeRaw`INSERT INTO trainr_test_guard VALUES ('disposable integration database')`
        await client.$disconnect()
        execFileSync(process.execPath, [resolve(root, 'node_modules/vitest/vitest.mjs'), 'run', '--config', 'vitest.postgres.config.ts'], {
          cwd: root, env: { ...process.env, TEST_DATABASE_URL: url, DATABASE_URL: url, TRAINR_ALLOW_DB_TESTS: '1' }, stdio: 'inherit', timeout: 180000,
        })
        console.log('PASS: complete SQL integration suite on migration-created schema')
      }
      await client.$disconnect()
    }
  } finally {
    for (const client of clients) await client.$disconnect()
    let cleanupFailures = 0
    for (const name of created) {
      try {
        const rows = await admin.$queryRaw<Array<{ owner: string; marker: string | null }>>`
          SELECT pg_get_userbyid(datdba) AS owner, shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname = ${name}`
        assert.deepEqual(rows, [{ owner: 'trainr_test', marker: tag }], 'Refusing cleanup of an unowned database')
        await admin.$executeRawUnsafe(`DROP DATABASE "${name}"`)
        console.log('PASS: removed owned disposable rehearsal database')
      } catch { cleanupFailures++; console.error('Rehearsal database cleanup failed or ownership was not verified; no forced disconnect attempted') }
    }
    await admin.$disconnect()
    if (cleanupFailures) throw new Error(`Manual review required for ${cleanupFailures} rehearsal database cleanup failure(s)`)
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : 'Migration rehearsal failed'); process.exitCode = 1 })
