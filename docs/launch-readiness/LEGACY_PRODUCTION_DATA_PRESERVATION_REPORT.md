# Legacy Production Data Preservation Report

**Observed:** 2026-10-18 01:50 UTC. **Source commit:** `467c287f551fb53f59bc0bd92be3e8d498ce7079` on `codex/payment-readiness-20261006`. **Live environment:** `https://trainr.cc`, Vercel `styleres-projects/trainr-node`, existing PostgreSQL 17.11 database on a Neon US East 1 endpoint. **Accounts used:** Vercel `styleretech` CLI login, database `neondb_owner` through the existing Production variable; no TRAINR customer account or credential was read. **Decision:** preserve and migrate existing Production data before any cutover. No live database write, Vercel environment change, domain switch, payment or payout was performed.

## Read-Only Source Inventory

1. Linked a separate local scratch directory to the existing `trainr-node` project and used `vercel env run -e production -- <command>`. The source `DATABASE_URL` was injected into child processes, not printed or committed. Its sanitized identity is a different Neon endpoint and database from the new candidate.
2. Ran the repository's `scripts/schema-check.mjs` and `scripts/migration-check.mjs` against the live source. Expected: current schema and all 26 migration receipts. Actual: schema gate **FAIL**, 144 expected columns absent; migration gate **FAIL**.
3. Ran `scripts/inspect-production-database.mjs` inside a read-only SQL transaction. Actual: 29 public base tables, **no `_prisma_migrations` table**, 31 users, 35 bookings, 28 payments, and no `package_purchases` table. `payments.stripeCheckoutSessionId` is absent. These are counts only; no customer rows or secrets were printed. The missing columns span new tables as well as existing `payments`, `bookings`, `users`, `coupons` and `trainer_profiles`.
4. Anonymous `GET https://trainr.cc/api/health` returned `ok: true`, `dbConnected: true`; anonymous `GET /api/bookings` returned `Unauthorized`. Earlier authenticated parent and trainer booking-list requests returned 500 with Prisma `P2022` for the missing checkout-session field. The new candidate schema does not repair the public site by itself.

## Encrypted Snapshot And Restore Proof

The installed `pg_dump` 16.15 correctly refused the 17.11 server. The EDB PostgreSQL 17.11 Windows client archive was downloaded from the [vendor binary page](https://www.enterprisedb.com/download-postgresql-binaries), and its SHA-256 `4b8db0930c38f6ef845db919551dedda3b6b845aeb0927b3d79a6e8e9e4537cf` matched [EDB's published checksum](https://github.com/EnterpriseDB/edb-installers/issues/682). A schema-only in-memory dump then passed (124,201 bytes; SHA-256 `ff02beba63f50c989d7959fca0e750bee8828b7c9e2dab254eb93924c8dbba85`).

`pg_dump --format=custom --no-owner --no-acl --schema=public` then streamed directly into AES-256-GCM encryption. The encrypted file is in the local, non-repository `trainr-vercel-readonly` scratch directory; its 32-byte key is stored separately through Windows DPAPI for this Windows user. No plaintext dump file was written. The encrypted archive is 91,447 bytes with SHA-256 `c5b42fca895f49ea62472615cb87221cda8aa36c4dcb70433f90bbeb3720c9ea`; its authenticated decryption yields PostgreSQL archive SHA-256 `6adf4bc0ed21cc1cab5d9b281530a38442d4098e0f8e620b84791853dadfcfbe`. `pg_restore --list` read it in memory: **169 archive entries, 29 table-data entries**.

Created only the separate `trainr_legacy_restore` database inside the isolated Neon candidate project `summer-mode-24133651`. The identity-guarded restore helper accepted only that exact database and host, decrypted the snapshot in memory, and ran `pg_restore` with `--single-transaction --exit-on-error`. After correcting the empty default `public` schema conflict, the restore **PASS**ed. Independent Neon SQL returned **29 tables, 31 users, 35 bookings and 28 payments**, matching the source inventory. The first failed restore attempts rolled back and left zero tables; no partial restore was accepted.

## Baseline And Additive Migration Rehearsal

1. Created an empty `trainr_baseline_reference` database in the same isolated candidate project and applied only the checked-in `0_baseline/migration.sql`. Compared its catalog with the unmodified restored legacy copy: **283 vs 282 columns, 280 vs 280 constraints, 54 vs 53 indexes, 51 vs 51 enum labels**. The sole differences were `payments.stripeCheckoutSessionId` and its unique index, both absent in legacy. Table counts matched at 29.
2. Added that nullable column and unique index **only to the restored copy** in one transaction. Independent catalog comparison then found **zero differences** across all 283 columns (including types, nullability and defaults), 280 constraints, 54 index definitions and 51 enum labels. This is structural parity for these catalog categories, not proof of every database property or row value.
3. With parity established, ran `prisma migrate resolve --applied 0_baseline` on the restored copy, followed by `prisma migrate deploy`. All remaining **25** checked-in migrations applied. Neither command ran against the live Production source or the separate empty `trainr` candidate database.
4. Independent post-upgrade Neon SQL returned **31 users, 35 bookings, 28 payments, 0 package purchases, 26 migration records, 26 applied, and one `payments.stripeCheckoutSessionId` column**. The repository's read-only `scripts/schema-check.mjs` and `scripts/migration-check.mjs` both **PASS**ed against the upgraded copy, including migration names and SHA-256 checksums.

The audit branch's `npm run check` then passed lint (42 warnings, zero errors), typecheck, unit tests and production build. An initial sandboxed run failed at Vitest startup because the checkout's shared `node_modules` path was denied; the authorized full rerun exited 0. This is local code quality proof, not a hosted deployment or live booking/payment retest.

## Approved Aggregate Integrity Retest

**Observed:** 2026-10-18 02:56 UTC. **Tested source commit:** `0bae49b8acc17309c7b253a96761d78026da73cf` plus the uncommitted read-only fingerprint script subsequently included in this report commit. **Environments:** Vercel `styleres-projects/trainr-node` Production database and the isolated upgraded `trainr_legacy_restore` database. **Accounts used:** Vercel `styleretech` CLI login and the existing database roles; no TRAINR customer login. The owner explicitly approved publishing aggregate hashes and financial totals, but no individual rows, names, emails or Stripe IDs.

**Steps and endpoints:** Run `vercel env run -e production -- node <absolute path>/scripts/financial-fingerprint.mjs` from the linked scratch directory; then run the same script through the identity-guarded restore helper against `trainr_legacy_restore`. Each script invocation uses one PostgreSQL `READ ONLY` transaction and a 10-second statement timeout. The script queries `public.users`, `public.bookings` and `public.payments`; it prints counts, booking/payment financial sums and MD5 comparison fingerprints over selected ID, role, status and financial fields. No HTTP route or Stripe endpoint was invoked.

| Aggregate | Live source | Upgraded restore | Result |
| --- | ---: | ---: | --- |
| User count / selected-field fingerprint | 31 / `76ec0484dbbeab59281ae31c93de7048` | 31 / same | PASS |
| Booking count / selected-field fingerprint | 35 / `a2f8360d7d6416676f2257c678858d2a` | 35 / same | PASS |
| Booking total / platform fee / trainer payout, cents | 181600 / 27240 / 154360 | same | PASS |
| Payment count / selected-field fingerprint | 28 / `d87776f624287f194406d89e85fdfb7a` | 28 / same | PASS |
| Payment amount / platform fee / trainer payout / recorded refund, cents | 143600 / 21540 / 122060 / 0 | same | PASS |

**Expected/actual:** selected fields and totals should agree; all compared aggregates did agree. The restore helper exited 0 with `LEGACY_FINGERPRINT_REHEARSAL: PASS`; the live command exited 0. These MD5 values are equality checks, not cryptographic security attestations. The query omits many columns and cannot prove full row-by-row identity, referential validity, current application behavior or Stripe settlement. The source can receive new writes after this snapshot, so a final cutover requires a fresh, bounded reconciliation. **Fix status:** no source-data fix required for these selected fields; live schema and hosted application blockers remain. **Retest proof:** the two independent invocations above yielded identical aggregates. **Launch decision: HOLD.**

## Remaining Gates

- The restored copy is now upgraded, but the **live source remains unmodified**: no migration ledger and 144 current-schema columns absent. A controlled Production rollout requires a fresh backup, an explicit one-column/index bridge, baseline parity recheck on the then-current live source, maintenance or a dual-write/catch-up strategy, and a rollback procedure. Do not apply the rehearsed commands to Production automatically.
- The matching aggregate hashes cover selected critical foreign keys, statuses, payment amounts, Stripe IDs and recorded refund amounts, but not every field or a row-by-row audit. Account for writes occurring after the snapshot before any eventual cutover.
- The encrypted local backup is recoverable only under the Windows user that created its DPAPI key. Preserve it until a durable backup and an independently tested recovery process exist. The restored copy contains real customer and payment metadata; keep it isolated and do not point any app or public endpoint at it.
- Test authenticated bookings, shared package credits, checkout/webhooks, Connect and payout in a separate synthetic-data environment. Stripe trainer onboarding and provider-backed money-flow proof remain open. **Launch decision: HOLD.**
