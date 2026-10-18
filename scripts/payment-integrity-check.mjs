#!/usr/bin/env node
import { PrismaClient } from '@prisma/client'
import { databaseCheckUrl, loadReadinessEnv, paymentIntegrityIssues, readPaymentIntegrity } from './readiness-checks.mjs'

let client
const deadline = setTimeout(() => {
  console.error('DB PAYMENT INTEGRITY CHECK: FAIL (inspection or disconnect timed out)')
  process.exit(1)
}, 25000)

try {
  loadReadinessEnv(process.cwd())
  const configuredUrl = process.env.DATABASE_URL
  const url = databaseCheckUrl(configuredUrl)
  if (!url) throw new Error('invalid configuration')
  const schema = new URL(configuredUrl).searchParams.get('schema') || 'public'
  client = new PrismaClient({ datasources: { db: { url } }, log: [] })
  const counts = await client.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '10000ms'")
    return readPaymentIntegrity(tx, schema)
  }, { maxWait: 5000, timeout: 20000 })
  const issues = paymentIntegrityIssues(counts)
  if (issues.length) {
    for (const issue of issues) console.error(`FAIL: ${issue}`)
    console.error('DB PAYMENT INTEGRITY CHECK: FAIL (review legacy receipts privately before release)')
    process.exitCode = 1
  } else {
    console.log(`DB PAYMENT INTEGRITY CHECK: PASS (${counts.positiveTerminal} positive settled payments and ${counts.positivePackageTerminal} packages checked; not Stripe reconciliation or payout signoff)`)
  }
} catch {
  console.error('DB PAYMENT INTEGRITY CHECK: FAIL (read-only inspection failed; inspect privately)')
  process.exitCode = 1
} finally {
  try { await client?.$disconnect() }
  catch {
    console.error('DB PAYMENT INTEGRITY CHECK: FAIL (disconnect failed)')
    process.exitCode = 1
  }
  clearTimeout(deadline)
}
