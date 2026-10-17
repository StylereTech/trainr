#!/usr/bin/env node
import { PrismaClient } from '@prisma/client'
import { databaseCheckUrl, loadReadinessEnv, readMigrationLedger } from './readiness-checks.mjs'
import { migrationManifest, verifyMigrationLedger } from './prepare-staging.mjs'

let client
const deadline = setTimeout(() => {
  console.error('DB MIGRATION CHECK: FAIL (inspection or disconnect timed out)')
  process.exit(1)
}, 20000)

try {
  loadReadinessEnv(process.cwd())
  const configuredUrl = process.env.DATABASE_URL
  const url = databaseCheckUrl(configuredUrl)
  if (!url) throw new Error('invalid configuration')
  const schema = new URL(configuredUrl).searchParams.get('schema') || 'public'
  client = new PrismaClient({ datasources: { db: { url } }, log: [] })
  const ledger = await readMigrationLedger(client, schema)
  verifyMigrationLedger(ledger, migrationManifest())
  console.log('DB MIGRATION CHECK: PASS (migration names, SHA256 checksums and applied status match; not schema, data or payment signoff)')
} catch {
  console.error('DB MIGRATION CHECK: FAIL (inspect migration history privately before any deployment or schema write)')
  process.exitCode = 1
} finally {
  try {
    await client?.$disconnect()
  } catch {
    console.error('DB MIGRATION CHECK: FAIL (disconnect failed)')
    process.exitCode = 1
  }
  clearTimeout(deadline)
}
