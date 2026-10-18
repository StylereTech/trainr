#!/usr/bin/env node
import { PrismaClient } from '@prisma/client'
import { databaseCheckUrl, loadReadinessEnv } from './readiness-checks.mjs'

loadReadinessEnv(process.cwd())
const url = databaseCheckUrl(process.env.DATABASE_URL)
if (!url) {
  console.error('FINANCIAL FINGERPRINT: FAIL (invalid database configuration)')
  process.exit(1)
}

const client = new PrismaClient({ datasources: { db: { url } }, log: [] })

try {
  const result = await client.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '10000ms'")

    const [users] = await tx.$queryRawUnsafe(`
      SELECT count(*)::int AS count,
        md5(coalesce(string_agg(jsonb_build_array(id, role)::text, '' ORDER BY id), '')) AS fingerprint
      FROM public.users`)
    const [bookings] = await tx.$queryRawUnsafe(`
      SELECT count(*)::int AS count,
        coalesce(sum("totalAmountInCents"), 0)::text AS "totalAmountInCents",
        coalesce(sum("platformFeeInCents"), 0)::text AS "platformFeeInCents",
        coalesce(sum("trainerPayoutInCents"), 0)::text AS "trainerPayoutInCents",
        md5(coalesce(string_agg(jsonb_build_array(id, "parentProfileId", "trainerProfileId",
          "athleteProfileId", "serviceOfferingId", status, "totalAmountInCents",
          "platformFeeInCents", "trainerPayoutInCents")::text, '' ORDER BY id), '')) AS fingerprint
      FROM public.bookings`)
    const [payments] = await tx.$queryRawUnsafe(`
      SELECT count(*)::int AS count,
        coalesce(sum("amountInCents"), 0)::text AS "amountInCents",
        coalesce(sum("platformFeeInCents"), 0)::text AS "platformFeeInCents",
        coalesce(sum("trainerPayoutInCents"), 0)::text AS "trainerPayoutInCents",
        coalesce(sum("refundAmountInCents"), 0)::text AS "refundAmountInCents",
        md5(coalesce(string_agg(jsonb_build_array(id, "bookingId", "stripePaymentIntentId",
          "stripeChargeId", "stripeTransferId", "amountInCents", "platformFeeInCents",
          "trainerPayoutInCents", status, "refundAmountInCents")::text, '' ORDER BY id), '')) AS fingerprint
      FROM public.payments`)
    return { users, bookings, payments }
  }, { maxWait: 5000, timeout: 30000 })

  console.log(JSON.stringify(result, null, 2))
} catch {
  console.error('FINANCIAL FINGERPRINT: FAIL (read-only comparison failed; no rows or credentials printed)')
  process.exitCode = 1
} finally {
  await client.$disconnect()
}
