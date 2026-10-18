#!/usr/bin/env node
import { Prisma, PrismaClient } from '@prisma/client'
import { databaseCheckUrl, loadReadinessEnv, missingDatabaseColumns, readMigrationLedger } from './readiness-checks.mjs'
import { migrationManifest } from './prepare-staging.mjs'

loadReadinessEnv(process.cwd())
const configuredUrl = process.env.DATABASE_URL
const url = databaseCheckUrl(configuredUrl)
if (!url) {
  console.error('PRODUCTION DB INVENTORY: FAIL (invalid database configuration)')
  process.exit(1)
}

const schema = new URL(configuredUrl).searchParams.get('schema') || 'public'
const client = new PrismaClient({ datasources: { db: { url } }, log: [] })

try {
  const inventory = await client.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '10000ms'")

    const tables = await tx.$queryRawUnsafe(
      'SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename', schema)
    const tableNames = new Set(tables.map((row) => row.tablename))
    const ledger = tableNames.has('_prisma_migrations') ? await readMigrationLedger(tx, schema) : []
    const missingColumns = await missingDatabaseColumns(tx, Prisma.dmmf.datamodel.models, schema)
    const counts = {}
    for (const table of ['users', 'bookings', 'payments', 'package_purchases']) {
      if (!tableNames.has(table)) {
        counts[table] = null
        continue
      }
      const rows = await tx.$queryRawUnsafe(`SELECT count(*) AS count FROM "${schema.replaceAll('"', '""')}"."${table}"`)
      counts[table] = Number(rows[0].count)
    }
    return { tableCount: tableNames.size, ledgerPresent: tableNames.has('_prisma_migrations'), ledger, missingColumns, counts }
  }, { maxWait: 5000, timeout: 30000 })

  const expected = migrationManifest()
  const expectedByName = new Map(expected.map((row) => [row.name, row.checksum]))
  const foundNames = new Set(inventory.ledger.map((row) => row.migration_name))
  const missingMigrations = expected.filter((row) => !foundNames.has(row.name)).map((row) => row.name)
  const unknownMigrations = inventory.ledger.filter((row) => !expectedByName.has(row.migration_name)).map((row) => row.migration_name)
  const checksumMismatches = inventory.ledger.filter((row) => expectedByName.has(row.migration_name)
    && expectedByName.get(row.migration_name) !== row.checksum).map((row) => row.migration_name)
  const unresolvedMigrations = inventory.ledger.filter((row) => !row.finished_at && !row.rolled_back_at)
    .map((row) => row.migration_name)
  const missingColumnsByTable = Object.entries(Object.groupBy(
    inventory.missingColumns.map((column) => column.split('.')[0]), (table) => table))
    .map(([table, entries]) => ({ table, count: entries.length }))
    .sort((a, b) => b.count - a.count || a.table.localeCompare(b.table))

  console.log(JSON.stringify({
    schema,
    tableCount: inventory.tableCount,
    criticalRecordCounts: inventory.counts,
    ledgerPresent: inventory.ledgerPresent,
    ledgerCount: inventory.ledger.length,
    expectedMigrationCount: expected.length,
    missingMigrations,
    unknownMigrations,
    checksumMismatches,
    unresolvedMigrations,
    missingColumnCount: inventory.missingColumns.length,
    missingColumnsByTable,
    checkoutSessionColumnPresent: !inventory.missingColumns.includes('payments.stripeCheckoutSessionId'),
  }, null, 2))
} catch {
  console.error('PRODUCTION DB INVENTORY: FAIL (read-only inspection failed; no data or credentials printed)')
  process.exitCode = 1
} finally {
  await client.$disconnect()
}
