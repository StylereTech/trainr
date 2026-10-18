# Production Candidate Database Report

**Observed:** 2026-10-18 01:11 UTC. **Audit source:** `5fddbdb5ca21035858d33ff17943d1ff6999f8bd`, branch `codex/payment-readiness-20261006`. **Environment:** new Neon project `trainr-production-candidate-20261017` (`summer-mode-24133651`), AWS US East 1, branch `main` (`br-ancient-bread-b8jgp2u4`), database `trainr`. **Live environment:** `https://trainr.cc` remains on the separate Vercel `trainr-node` project and its existing database. No Vercel environment variable or domain mapping was changed.

## Purpose and Baseline

The current Neon login can list only the unrelated personal project and TRAINR's isolated staging project; it cannot list the Neon project behind the public site's configured Production database. Public parent and trainer `GET /api/bookings?page=1&limit=10` have each returned 500, with earlier Vercel logs reporting Prisma `P2022` for missing `payments.stripeCheckoutSessionId`. The public health endpoint nevertheless reports a database connection. That is evidence of an existing but inaccessible-from-this-Neon-login Production database, **not** proof that its data is gone.

The owner authorized creation of a database if the existing project could not be found. A separate **candidate**, not a replacement live database, was created so its schema could be built and tested without affecting customer or payment records. Initial read-only `information_schema.tables` query returned **0** application tables. No account or synthetic fixtures were seeded.

## Build and Verification

1. Created Neon project in the personal organization, with `trainr` database and `trainr_owner` role. Confirmed project, branch, database and direct read-write endpoint identities through Neon metadata. The privileged connection string was passed transiently over non-echoing process stdin to Prisma; it was not printed, committed or saved in a file.
2. Ran `prisma migrate deploy` against that exact new database. Expected 26 committed migrations to apply on the empty target. Actual: all **26/26** applied successfully, exit 0, from `0_baseline` through `20261017193000_link_booking_coupon`.
3. Independently queried only `public._prisma_migrations` metadata through Neon: **26 total, 26 applied, 0 unresolved**. Its ordered name/SHA-256 checksum aggregate `459b59becb4dede7e99e79a3b910364f` matched a fresh local calculation over the 26 checked-out migration SQL files.
4. Read `information_schema.columns`: `payments.stripeCheckoutSessionId` exists as nullable `text`. The new schema has **44** base tables including the Prisma migration ledger.
5. Ran the repo's read-only `scripts/schema-check.mjs` and `scripts/migration-check.mjs` against the same candidate via transient connection string. Both returned **PASS**, exit 0. These checks cover Prisma model column presence and migration names/checksums/applied status, not all constraints, indexes, data integrity or payment behavior.
6. A bounded read-only count query returned **0 users, 0 bookings, 0 payments and 0 package purchases** in the candidate. No application session, checkout, webhook or payout has been exercised against it.

**Account used:** Neon project owner role for migration; no TRAINR application user logged in. **Routes/endpoints tested:** Neon project/branch/database metadata; direct PostgreSQL endpoint for Prisma migration and read-only gates. No application route was pointed at this candidate. No screenshots were needed; sanitized CLI/SQL result counts above are the retest proof.

## Cutover Blockers

The candidate has no parent, trainer, booking, payment, refund, package, coupon, Stripe account-link or admin records. Pointing public `trainr.cc` at it now would orphan the existing live data and accounts. Before a cutover, locate or securely access the old Production database, take and verify a backup, inspect its migration ledger and full schema, reconcile users and financial records, rehearse a migration into a disposable restore, and test authenticated parent/trainer reads, booking, Stripe sandbox Checkout/webhook/Connect/transfer and payout. Separately complete the Stripe test trainer's seven past-due onboarding requirements with the account holder. Do not run `db push`, replay the baseline on the old database, or switch Vercel `DATABASE_URL` merely because this new candidate is green.

**Fix status:** empty candidate schema prepared and verified. **Production blocker status:** existing database access/data migration and Stripe provider onboarding unresolved. **Launch decision:** HOLD; no Production deployment or money-flow signoff.
