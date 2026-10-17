# PostgreSQL Integration Verification

2026-10-08 migration follow-up (baseline `ba6fb20def90af42669ceee589bdf657b0d8cf5c`): [Migration Bootstrap And Upgrade Rehearsal](MIGRATION_BOOTSTRAP_REPORT.md) records the reproduced empty-database failure, historical baseline repair, guarded fresh/legacy rehearsals, exact tests and publication evidence. This supersedes the missing-baseline finding only. Actual production schema/ledger review, tested backups, isolated staging and real Stripe checkout/Connect/payout verification remain open; production and money-flow signoff remain **HOLD**.

2026-10-08 05:33 UTC extension: **23/23 passed in 2.84 seconds**, baseline `386cf391cff30eec2a3b6ad388a539a107b43648` plus this commit. Actual trainer GET/PUT handlers used real Prisma/PostgreSQL with synthetic auth to validate catalog membership, stable IDs, refresh/readback, invalid-link rejection and full rollback after forced availability SQL failure. Final catalog/user fixture counts were zero; temporary constraint removed and server stopped. Details: [authoritative catalog checkpoint](AUDIT_CHECKPOINT_2026-10-06.md). No production authentication or data writes are claimed.

2026-10-08 05:23 UTC extension: **21/21 passed in 3.83 seconds** on baseline `1cc8ee4b738f8dfec51fb18ecc6a832222af4af1` plus this commit. Added actual certification-row preservation, ownership rejection across two real trainer rows, and rollback after a later SQL foreign-key failure. Credential IDs, verification, dates and evidence were independently read back. Final users/bookings/payments/certifications counts were zero and the cluster stopped. See the [credential checkpoint](AUDIT_CHECKPOINT_2026-10-06.md); these are synthetic database records, not real qualification verification.

Latest extension, 2026-10-08 05:12 UTC: **18/18 passed**, including real fee-writer serialization, audit-foreign-key rollback and preservation of snapshotted booking fees after configuration changes. Baseline `29d8ae449bf91ba98919dcdd4314a69f0391a050` plus this commit; see [fee configuration report](FEE_CONFIGURATION_REPORT.md). All six synthetic record categories were independently verified empty after cleanup and the server stopped. Earlier results below remain historical subsets.

- Date/time: 2026-10-08 04:49-04:52 UTC.
- Source baseline: `ac7c579e1fcd5af6fc06f11b5678a458aec25766`; harness is in the commit containing this report. Application source is unchanged in this pass.
- Environment: Windows, Node 22, PostgreSQL 16.15, Prisma 6.19.3. Disposable local database `trainr_audit_20261008`, role `trainr_test`, listener `127.0.0.1:55439` only.
- Accounts: randomly named synthetic parent/trainer users at `example.test`, synthetic children, services and coupons. No customer data, production credentials or real Stripe accounts.
- Surface: application helpers used by booking creation/actions and checkout/webhook endpoints. This suite calls helpers directly, NOT HTTP routes or browser flows.
- Result: **PASS, 12 tests** against actual PostgreSQL. Stripe is mocked; no checkout, charge, transfer, refund or payout occurred at Stripe.

## Setup And Exact Steps

1. Downloaded the official EnterpriseDB Windows PostgreSQL 16.15 binary archive; extracted runtime files without installing a Windows service. Observed archive SHA-256 `43BB45F173A6F08CF1D29A97A6D8DEB119E8E8093A24C00D2D1001A0CCAA8281` is a local fingerprint, not an independently verified publisher checksum. Source: [EnterpriseDB binary downloads](https://www.enterprisedb.com/download-postgresql-binaries).
2. Initialized a new ignored `.postgres-test/data` cluster with role `trainr_test`, UTF-8 and local trust authentication. Started it on loopback port 55439 with 16 MB shared buffers and 20 maximum connections. This trust configuration is solely for the disposable synthetic cluster and must not be copied into production.
3. Created `trainr_audit_20261008`. Extracted `prisma/schema.prisma` from pre-checkout-attempt commit `cdbb06360d1c6947c53b09a38ea74d842698c90a`. Generated initial SQL using `prisma migrate diff --from-empty --to-schema-datamodel <baseline-schema> --script --output <baseline.sql>`.
4. Applied baseline SQL using `psql -v ON_ERROR_STOP=1`, then the exact repository file `prisma/migrations/20261008040000_add_checkout_attempts/migration.sql`, then `tests/integration/test-guard.sql`. All succeeded. This does not establish the schema or migration history of the production database.
5. Ran the separate integration command below. The normal unit suite does not include these tests and does not count a missing database as a passing integration test.

```powershell
$env:TEST_DATABASE_URL = 'postgresql://trainr_test@127.0.0.1:55439/trainr_audit_20261008?connection_limit=5&pool_timeout=10'
$env:TRAINR_ALLOW_DB_TESTS = '1'
npm.cmd run test:postgres
```

The guard requires explicit authorization, a loopback host, the dedicated role/database naming convention, public schema, approved connection options and an exact database marker before fixture writes. Never add this marker to a shared or production database. Runtime binaries and `.postgres-test` contents are not committed.

## Expected And Actual Results

| Test | Expected | Actual |
| --- | --- | --- |
| Independent clients | Separate PostgreSQL backend sessions | PASS: distinct backend PIDs |
| Exact checkout migration | Partial unique active-attempt index installed | PASS: inspected `pg_indexes` definition |
| Three overlapping individual bookings | One committed winner | PASS: independent readback counted one |
| Held trainer row lock | Reservation waits in PostgreSQL before commit | PASS: observed `pg_blocking_pids` and `wait_event_type = 'Lock'`, then released and committed |
| Group capacity two, three concurrent requests | Two successful reservations | PASS |
| Single-use coupon, competing times | One booking and one coupon use | PASS: independent readback |
| Notification insert rejected by SQL constraint | Entire booking/coupon transaction rolls back | PASS: zero bookings, zero coupon uses; test constraint removed |
| Concurrent active attempts | Database rejects duplicate, allows retired replacement | PASS: Prisma P2002 then successful replacement |
| Three checkout retries | One stored attempt, one provider idempotency key, matching saved session | PASS: real DB; simulated provider only |
| Duplicate settlement and refund/success race | One confirmation notification; refund wins | PASS: payment REFUNDED and booking CANCELLED |
| Payment after cancellation | Booking remains cancelled, review notification created | PASS |
| Concurrent completion retries | Trainer session counter increments once | PASS |

Initial ten-case run passed; the strengthened twelve-case run passed at 04:49:41 UTC in 2.11 seconds. Expected SQL errors from the deliberate constraint/uniqueness tests are not unexpected suite failures.

Retest at 04:53:39 UTC after a clean PostgreSQL restart: **12/12 passed in 16.28 seconds**. The migrated schema/guard survived restart; this is not crash-recovery testing or persistence of production records. Fixture counts were again zero, and `pg_ctl -m fast -w stop` confirmed server shutdown at approximately 04:54 UTC.

At 04:52 UTC, independent SQL verification returned PostgreSQL 16.15, `listen_addresses = 127.0.0.1`, `fsync = on`, `synchronous_commit = on`. Counts of users, bookings, payments and coupons were all zero after cleanup. The temporary notification failure constraint was absent. Cleanup deletes only tracked synthetic fixtures, never truncates tables.

## Fix And Blocker Status

The missing local real-database test harness is resolved. Database row-lock, constraint, commit/readback and rollback behavior now have executable local evidence. This is not crash-recovery, production persistence, real Stripe idempotency or a successful bank payout proof.

Still required: staging schema-drift review and migration rehearsal against the actual deployment baseline; Stripe test-mode network/recovery/refund/Connect verification; remaining application fixes; privileged-account remediation; explicit migration/deployment to the actual `trainr-node` production project; controlled live smoke and money-flow signoff. Main and production were not changed in this pass.

Full quality-gate retest and audit-branch publication are recorded in the [current checkpoint](AUDIT_CHECKPOINT_2026-10-06.md).

## Amount-Boundary Retest: 2026-10-08 04:57 UTC

Source baseline `31eabbaffdff473483116cca6f9b987b8f141e24` plus the amount-guard changes in this report's commit. Same local database and synthetic account isolation. Added zero/49/50-cent coupon cases: zero confirms with zero settled local payment and no provider call; 49 rejects with zero coupon usage/bookings/notifications; 50 persists a pending booking/payment and exact balanced split, using only a mocked checkout provider. **15/15 integration tests passed in 8.32 seconds**. Independent cleanup counts again returned zero for users, bookings, payments and coupons; clean server shutdown confirmed. No real Stripe success or production persistence is implied.
