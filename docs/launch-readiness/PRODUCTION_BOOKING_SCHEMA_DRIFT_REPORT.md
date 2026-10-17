# Production Booking Schema Drift Report

**Observed:** 2026-10-17 21:09 UTC. **Environment:** public `https://trainr.cc`, Vercel project `trainr-node`, deployment `FEp6XgWZotobnxofLrhpssQdJoWN`, source `2067e743c54ffee669cd484f26dc472b157f1881`. **Audit-branch baseline:** `4c88e6c024b47d8ad7ad3f0790ebc516ec786e20`. No database or deployment write was performed.

## Reproduction

The approved existing parent `jennifer.davis@email.com` and trainer `marcus.johnson@email.com` demo accounts each signed in through `/auth/signin`; no passwords are recorded here. Opt-in, read-only Playwright command: `TRAINR_PUBLIC_DEMO_STATUS=1 npm run test:e2e -- e2e/production-booking-read.spec.ts --project=chromium --workers=1`. Each test requested `GET /api/bookings?page=1&limit=10` and expected HTTP 200 with a bookings array and pagination. **Actual: 500 for both roles; 0/2 passed.** No booking POST, checkout, refund or payout was attempted. The cases are intentionally red until Production is repaired.

The `trainr-node` Vercel Request Logs at **2026-10-17 21:01:45.910 UTC** and **21:03:39.250 UTC** show `PrismaClientKnownRequestError P2022` on `prisma.booking.findMany()`: **`The column payments.stripeCheckoutSessionId does not exist in the current database.`** `GET /api/bookings` returned 500 while the trainer page and `GET /api/trainer/stripe-connect` returned 200. A public `/api/health` database-connected result therefore cannot be treated as booking-schema proof.

At public source `2067e74`, `prisma/schema.prisma` includes `Payment.stripeCheckoutSessionId`, but `git ls-tree -r 2067e74 prisma` shows only the unrelated `20260501210000_add_trainer_phone_leads` migration, not a baseline for the expected payment schema. The audit branch now contains `prisma/migrations/0_baseline/migration.sql` with the column, but its existence does **not** establish that it is safe to apply to the current Production database. The actual Production migration ledger and other drift have not been read.

## Severity and repair gate

**P0 launch blocker:** both parent and trainer booking reads fail in Production. The parent form can enable **Book & Pay**, but paid booking, refresh state and trainer visibility cannot be signed off while this query fails. Do not take live money or promote the audit branch on a claim of database connectivity alone.

Before any schema write: identify the exact Production `DATABASE_URL` target without exposing its secret; take a verified backup; inspect the current tables/columns/indexes and `_prisma_migrations` in a read-only session; compare against the specific deployment's Prisma schema and the reviewed target migrations; rehearse the proposed migration against a disposable restored copy with representative records; run schema/checksum and booking-read checks; then schedule a controlled Production migration and deployment. Do **not** run `prisma db push` or mark the baseline applied merely to silence P2022. Afterward rerun both authenticated booking reads, creation/refresh and Stripe sandbox settlement paths with a known deployment SHA. Parent/trainer read tests should then pass without retries.

**Fix status:** diagnosed, not repaired. **Retest proof:** failing parent/trainer Playwright cases plus Vercel P2022 logs; no green post-fix retest exists. **Owner dependency:** controlled access to the real Production database and deployment process.

## Read-only release gate, 2026-10-17 21:14 UTC

The audit branch now includes `npm run db:schema-check` and runs it after connectivity in `npm run verify:prod`. It compares the generated Prisma client's scalar/enum column names (including mapped table/column names) with `information_schema.columns` for the configured schema, without reading customer rows or writing to the database. It reports at most ten code-derived missing identifiers. A synthetic fixture with **43 models / 426 columns** passed when complete and returned exactly `payments.stripeCheckoutSessionId` when that one column was removed; the CLI invalid-URL fixture failed closed. Syntax checks passed. The existing Vitest runner could not start in this junction-backed temporary checkout because esbuild was denied filesystem access, so its new unit cases are **written but not claimed executed**. The new gate has not run against Production or Preview and cannot prove column types, constraints, indexes, migration history, persistence or Stripe settlement.

The public `trainr-node` Vercel Storage panel shows **no database connected through Vercel Storage**. `DATABASE_URL` is a manually configured, masked Production project variable; its value was not revealed. Direct schema and `_prisma_migrations` inspection still needs separately approved controlled access. The audit-branch baseline SQL itself says it is unsafe to replay over existing tables; no automatic Production migration is authorized by this report.

At **2026-10-17 21:17 UTC**, the separately approved isolated Preview Neon query editor, with **Read-only** checked, ran `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'stripeCheckoutSessionId';`. It returned exactly one row, `payments / stripeCheckoutSessionId`, in 822 ms. This verifies the query's target and that one Preview column, not the full 426-column CLI check and not the Production schema.
