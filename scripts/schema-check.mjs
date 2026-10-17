#!/usr/bin/env node
import { Prisma, PrismaClient } from '@prisma/client'
import { databaseCheckUrl, loadReadinessEnv, missingDatabaseColumns } from './readiness-checks.mjs'

let client
const deadline = setTimeout(() => {
  console.error('DB SCHEMA CHECK: FAIL (inspection or disconnect timed out)')
  process.exit(1)
}, 20000)

try {
  loadReadinessEnv(process.cwd())
  const configuredUrl = process.env.DATABASE_URL
  const url = databaseCheckUrl(configuredUrl)
  if (!url) throw new Error('invalid configuration')
  const schema = new URL(configuredUrl).searchParams.get('schema') || 'public'
  client = new PrismaClient({ datasources: { db: { url } }, log: [] })
  const missing = await missingDatabaseColumns(client, Prisma.dmmf.datamodel.models, schema)
  if (missing.length) {
    console.error(`DB SCHEMA CHECK: FAIL (${missing.length} expected columns missing; first: ${missing.slice(0, 10).join(', ')})`)
    process.exitCode = 1
  } else {
    console.log('DB SCHEMA CHECK: PASS (Prisma model columns present; not migration, index, constraint or data signoff)')
  }
} catch {
  console.error('DB SCHEMA CHECK: FAIL (inspect database configuration and schema privately)')
  process.exitCode = 1
} finally {
  try {
    await client?.$disconnect()
  } catch {
    console.error('DB SCHEMA CHECK: FAIL (disconnect failed)')
    process.exitCode = 1
  }
  clearTimeout(deadline)
}
