#!/usr/bin/env node
import { PrismaClient } from '@prisma/client'
import { databaseCheckUrl, loadReadinessEnv, verifyDatabaseQuery } from './readiness-checks.mjs'

let client
// Bound the CLI even if a driver or shutdown stalls. No writes are performed.
const deadline = setTimeout(() => {
  console.error('DB CHECK: FAIL (query or disconnect timed out)')
  process.exit(1)
}, 20000)
try {
  loadReadinessEnv(process.cwd())
  const url = databaseCheckUrl(process.env.DATABASE_URL)
  if (!url) throw new Error('invalid configuration')
  client = new PrismaClient({ datasources: { db: { url } }, log: [] })
  if (!await verifyDatabaseQuery(client)) throw new Error('unexpected query result')
  await client.$disconnect()
  console.log('DB CHECK: PASS (authenticated SELECT 1; not schema or persistence signoff)')
} catch {
  console.error('DB CHECK: FAIL (check PostgreSQL configuration, credentials and connectivity privately)')
  process.exitCode = 1
} finally {
  try {
    await client?.$disconnect()
  } catch {
    console.error('DB CHECK: FAIL (disconnect failed)')
    process.exitCode = 1
  }
  clearTimeout(deadline)
}
