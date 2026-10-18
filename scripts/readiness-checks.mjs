import fs from 'node:fs'
import path from 'node:path'
import { parseEnv } from 'node:util'

/** @param {string} cwd @param {Record<string, string | undefined>} env */
export function loadReadinessEnv(cwd, env = process.env) {
  // Match production file precedence, without replacing explicitly supplied values.
  for (const name of ['.env.production.local', '.env.local', '.env.production', '.env']) {
    const file = path.join(cwd, name)
    if (!fs.existsSync(file)) continue
    for (const [key, value] of Object.entries(parseEnv(fs.readFileSync(file, 'utf8')))) {
      if (!(key in env)) env[key] = value
    }
  }
}

export function productionEnvErrors(env) {
  const errors = []
  const required = ['DATABASE_URL', 'NEXTAUTH_URL', 'NEXTAUTH_SECRET',
    'NEXT_PUBLIC_STRIPE_PUBLIC_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_CONNECT_WEBHOOK_SECRET',
    'RESEND_API_KEY', 'EMAIL_FROM', 'NEXT_PUBLIC_APP_URL']
  for (const key of required) {
    const value = env[key]?.trim() || ''
    if (!value) errors.push(`${key} is missing`)
    else if (/xxx|placeholder|changeme|your_|change-in-production|local_fixture/i.test(value)) {
      errors.push(`${key} looks like a placeholder`)
    }
  }
  for (const key of ['NEXTAUTH_URL', 'NEXT_PUBLIC_APP_URL']) {
    if (env[key] && !/^https:\/\/trainr\.cc\/?$/.test(env[key])) errors.push(`${key} must be the canonical production origin https://trainr.cc`)
  }
  if (env.NEXTAUTH_SECRET && env.NEXTAUTH_SECRET.length < 32) errors.push('NEXTAUTH_SECRET must contain at least 32 characters')
  if (env.STRIPE_SECRET_KEY && !/^sk_live_\S+$/.test(env.STRIPE_SECRET_KEY)) errors.push('STRIPE_SECRET_KEY must be live mode for production verification')
  if (env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY && !/^pk_live_\S+$/.test(env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY)) errors.push('NEXT_PUBLIC_STRIPE_PUBLIC_KEY must be live mode for production verification')
  if (env.STRIPE_PUBLIC_KEY && env.STRIPE_PUBLIC_KEY !== env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY) errors.push('Stripe publishable keys do not match')
  if (env.STRIPE_WEBHOOK_SECRET && !/^whsec_\S+$/.test(env.STRIPE_WEBHOOK_SECRET)) errors.push('STRIPE_WEBHOOK_SECRET has an invalid format')
  if (env.STRIPE_CONNECT_WEBHOOK_SECRET && !/^whsec_\S+$/.test(env.STRIPE_CONNECT_WEBHOOK_SECRET)) errors.push('STRIPE_CONNECT_WEBHOOK_SECRET has an invalid format')
  if (env.STRIPE_WEBHOOK_SECRET && env.STRIPE_CONNECT_WEBHOOK_SECRET === env.STRIPE_WEBHOOK_SECRET) errors.push('Stripe platform and Connect webhook secrets must be distinct')
  if (env.DATABASE_URL && !databaseCheckUrl(env.DATABASE_URL)) errors.push('DATABASE_URL must be a valid PostgreSQL URL')
  return errors
}

export function databaseCheckUrl(value) {
  try {
    const url = new URL(value)
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname.length < 2) return null
    url.searchParams.set('connect_timeout', '5')
    url.searchParams.set('pool_timeout', '5')
    url.searchParams.set('socket_timeout', '10')
    url.searchParams.set('connection_limit', '1')
    return url.toString()
  } catch {
    return null
  }
}

export async function verifyStripeLive(secret, fetcher = fetch) {
  try {
    const response = await fetcher('https://api.stripe.com/v1/balance', {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(10000), redirect: 'error',
    })
    if (!response.ok) return `Stripe API authentication failed (HTTP ${response.status})`
    const balance = await response.json()
    if (balance?.object !== 'balance' || balance.livemode !== true) return 'Stripe did not confirm a live-mode balance response'
    return null
  } catch {
    // Provider bodies, connection strings and exception messages can contain secrets.
    return 'Stripe verification failed or timed out; inspect the provider dashboard privately'
  }
}

export async function verifyDatabaseQuery(client) {
  const result = await client.$queryRawUnsafe('SELECT 1 AS readiness')
  return Array.isArray(result) && result.length === 1 && result[0].readiness === 1
}

export async function missingDatabaseColumns(client, models, schema = 'public') {
  const rows = await client.$queryRawUnsafe(
    'SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = $1', schema)
  if (!Array.isArray(rows) || rows.some(row => typeof row.table_name !== 'string' || typeof row.column_name !== 'string')) {
    throw new Error('Invalid schema inspection response')
  }
  const present = new Set(rows.map(row => `${row.table_name}.${row.column_name}`))
  return models.flatMap(model => model.fields
    .filter(field => field.kind !== 'object')
    .map(field => `${model.dbName || model.name}.${field.dbName || field.name}`)
    .filter(column => !present.has(column))).sort()
}

function quotedSchema(schema) {
  if (typeof schema !== 'string' || !schema || schema.includes('\0') || Buffer.byteLength(schema, 'utf8') > 63) {
    throw new Error('Invalid migration schema')
  }
  return `"${schema.replaceAll('"', '""')}"`
}

export async function readMigrationLedger(client, schema = 'public') {
  const identifier = quotedSchema(schema)
  return client.$queryRawUnsafe(`SELECT migration_name, checksum, finished_at, rolled_back_at FROM ${identifier}."_prisma_migrations"`)
}

export async function readPaymentIntegrity(client, schema = 'public') {
  const identifier = quotedSchema(schema)
  const rows = await client.$queryRawUnsafe(`
    SELECT
      (SELECT count(*)::int FROM ${identifier}."payments" p
        WHERE p."amountInCents" > 0 AND p.status IN ('SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED')) AS "positiveTerminal",
      (SELECT count(*)::int FROM ${identifier}."payments" p
        WHERE p."amountInCents" > 0 AND p.status IN ('SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED')
          AND (p."stripeCheckoutSessionId" IS NULL OR p."stripePaymentIntentId" IS NULL OR p."stripeChargeId" IS NULL
            OR p."stripeTransferId" IS NULL)) AS "missingProviderReceipt",
      (SELECT count(*)::int FROM ${identifier}."payments" p
        WHERE p."amountInCents" > 0 AND p.status IN ('SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED')
          AND p."settlementVerifiedAt" IS NULL) AS "missingSettlementVerification",
      (SELECT count(*)::int FROM ${identifier}."payments" p
        WHERE p."amountInCents" > 0 AND p.status IN ('SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED')
          AND p."financialReview" IS NOT NULL) AS "openFinancialReview",
      (SELECT count(*)::int FROM ${identifier}."payments" p LEFT JOIN ${identifier}."bookings" b ON b.id = p."bookingId"
        WHERE b.id IS NULL OR p."amountInCents" <> b."totalAmountInCents") AS "missingBookingOrAmountMismatch",
      (SELECT count(*)::int FROM ${identifier}."payments" p
        WHERE p."amountInCents" < 0 OR p."platformFeeInCents" < 0 OR p."trainerPayoutInCents" < 0
          OR p."amountInCents" <> p."platformFeeInCents" + p."trainerPayoutInCents"
          OR p."refundAmountInCents" < 0 OR p."refundAmountInCents" > p."amountInCents") AS "invalidPaymentAmounts",
      (SELECT count(*)::int FROM ${identifier}."bookings" b
        WHERE b."totalAmountInCents" < 0 OR b."platformFeeInCents" < 0 OR b."trainerPayoutInCents" < 0
          OR b."totalAmountInCents" <> b."platformFeeInCents" + b."trainerPayoutInCents") AS "invalidBookingAmounts",
      (SELECT count(*)::int FROM ${identifier}."package_purchases" p
        WHERE p."amountInCents" > 0 AND p.status IN ('SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED')) AS "positivePackageTerminal",
      (SELECT count(*)::int FROM ${identifier}."package_purchases" p
        WHERE p."amountInCents" > 0 AND p.status IN ('SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED')
          AND (p."stripeCheckoutSessionId" IS NULL OR p."stripePaymentIntentId" IS NULL OR p."stripeChargeId" IS NULL
            OR p."stripeTransferId" IS NULL)) AS "missingPackageProviderReceipt",
      (SELECT count(*)::int FROM ${identifier}."package_purchases" p
        WHERE p."amountInCents" > 0 AND p.status IN ('SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED')
          AND p."settlementVerifiedAt" IS NULL) AS "missingPackageSettlementVerification",
      (SELECT count(*)::int FROM ${identifier}."package_purchases" p
        LEFT JOIN ${identifier}."package_payment_receipts" r ON r."purchaseId" = p.id
        WHERE p."amountInCents" > 0 AND p.status IN ('SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED')
          AND (r."purchaseId" IS NULL OR r."stripePaymentIntentId" <> p."stripePaymentIntentId"
            OR r."stripeChargeId" <> p."stripeChargeId" OR r."stripeCheckoutSessionId" <> p."stripeCheckoutSessionId")) AS "missingPackageSuccessReceipt",
      (SELECT count(*)::int FROM ${identifier}."package_purchases" p
        WHERE p."amountInCents" > 0 AND p.status IN ('SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED')
          AND p."financialReview" IS NOT NULL) AS "openPackageFinancialReview",
      (SELECT count(*)::int FROM ${identifier}."package_purchases" p
        WHERE p."amountInCents" <= 0 OR p."platformFeeInCents" < 0 OR p."trainerPayoutInCents" < 0
          OR p."amountInCents" <> p."platformFeeInCents" + p."trainerPayoutInCents"
          OR p."refundAmountInCents" < 0 OR p."refundAmountInCents" > p."amountInCents") AS "invalidPackageAmounts"
  `)
  const keys = ['positiveTerminal', 'missingProviderReceipt', 'missingSettlementVerification', 'openFinancialReview',
    'missingBookingOrAmountMismatch', 'invalidPaymentAmounts', 'invalidBookingAmounts', 'positivePackageTerminal',
    'missingPackageProviderReceipt', 'missingPackageSettlementVerification', 'missingPackageSuccessReceipt',
    'openPackageFinancialReview', 'invalidPackageAmounts']
  if (!Array.isArray(rows) || rows.length !== 1 || keys.some(key => !Number.isSafeInteger(rows[0]?.[key]) || rows[0][key] < 0)) {
    throw new Error('Invalid payment integrity response')
  }
  return rows[0]
}

export function paymentIntegrityIssues(counts) {
  return [
    ['missingProviderReceipt', 'positive settled payments lack complete Stripe Checkout, intent, charge or transfer IDs'],
    ['missingSettlementVerification', 'positive settled payments lack settlement verification'],
    ['openFinancialReview', 'positive settled payments have open financial review'],
    ['missingBookingOrAmountMismatch', 'payments lack a booking or disagree with its amount'],
    ['invalidPaymentAmounts', 'payments have invalid or inconsistent amounts'],
    ['invalidBookingAmounts', 'bookings have invalid or inconsistent amounts'],
    ['missingPackageProviderReceipt', 'positive settled packages lack complete Stripe Checkout, intent, charge or transfer IDs'],
    ['missingPackageSettlementVerification', 'positive settled packages lack settlement verification'],
    ['missingPackageSuccessReceipt', 'positive settled packages lack a matching signed-success receipt'],
    ['openPackageFinancialReview', 'positive settled packages have open financial review'],
    ['invalidPackageAmounts', 'packages have invalid or inconsistent amounts'],
  ].filter(([key]) => counts[key] > 0).map(([key, label]) => `${counts[key]} ${label}`)
}
