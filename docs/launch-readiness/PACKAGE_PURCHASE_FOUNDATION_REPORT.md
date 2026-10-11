# Family-Shared Package Purchase Foundation

## Identity And Scope

- Date: 2026-10-11 UTC. Baseline commit `81d81528180cd63ce2f95b5143649218452cfdd1`, audit branch `codex/payment-readiness-20261006`.
- Environment: local source and guarded disposable PostgreSQL 16.15, loopback port 55439, database `trainr_audit_timezone_20261011`, role `trainr_test`. Migration rehearsals create and remove separately ownership-marked disposable databases.
- Accounts: generated synthetic parent/trainer users under `example.test`; the primary parent has two synthetic children. No real customer data, Stripe charge, transfer, payout or Production write.
- Boundary tested: internal `preparePackagePurchase`, strict purchase/terms schemas, real database constraints, concurrent catalog edits and request retries. No new public route or checkout button is enabled by this change.
- Verdict: **PASS for pending purchase preparation; INCOMPLETE/HOLD for usable package purchases, credits, Stripe settlement and redemption.**

## Implementation

The parent owns `PackagePurchase`; no child is selected or stored at purchase preparation. An immutable versioned terms snapshot preserves each service's identity, title, sport, duration, type and session count, the catalog revision, total sessions and validity duration. Server-calculated price and fee split are also immutable. A composite parent/request identity and serialized transaction make identical retries return the same record; changed input on the same key is rejected.

The additive migration adds one table, foreign keys retaining purchase history, amount/hash/version constraints and an update trigger protecting ownership, terms, request identity and amounts. It neither changes nor backfills existing booking/payment records. Snapshot validity duration is not an implemented expiry policy; no clock starts and no credit is granted here.

Catalog edits remain possible for future offers without changing saved purchase terms. Returning an existing pending record after a catalog edit is retry recovery, not approval to charge it. Future checkout must independently recheck current access, trainer/Connect readiness and immutable purchase identity before releasing a payment link.

## Steps And Results

| Steps / Expected Result | Actual Result | Status |
| --- | --- | --- |
| Prepare a reviewed package as a parent with two children; reload via an independent Prisma client; preserve parent-owned price and per-service terms | Stored PENDING, 25,000 cents split 3,750/21,250 under default fees; no athlete association, booking, Payment or wallet entry | PASS |
| Submit identical concurrent requests; persist one record | Both callers receive the same ID; independent count is one | PASS |
| Reuse the request ID under another parent | Distinct parent-owned record; no cross-family retrieval | PASS |
| Change the amount on an already used request key | Conflict; original record unchanged | PASS |
| Edit catalog quantities/price, service title/duration, then deactivate; replay original request | Original snapshot returned unchanged | PASS |
| Change fee configuration after preparation | Replay retains original split; a distinct new purchase uses the new split | PASS |
| Inject athlete, owner, payment state or amounts not in the request contract | Strict validation rejects unsupported fields | PASS |
| Use revoked/non-parent access on replay, missing profile, invalid or unavailable package/service/sport | Denied without new records | PASS |
| Prepare a mixed-service package | Separate quantities 5 and 3 persist, including distinct group duration/type | PASS |
| Directly update snapshot/owner/amount/request/revision or delete its catalog package | Database rejects the change; snapshot remains intact | PASS |
| Insert invalid fee total, request hash or snapshot version directly | Database rejects the record | PASS |
| Hold a trainer lock, concurrently prepare, then commit package deactivation | Waiting purchase observes committed deactivation and creates nothing | PASS |
| Rehearse migrations on fresh, historical and phone-history databases | Fourteen checksums and safeguards pass; schema parity, no-op replay and legacy row preservation pass; all owned rehearsal databases removed | PASS |

Retest evidence:

- Initial focused schema/initializer run: 57 passed. The first sandboxed invocation failed before test execution because the test bundler could not read an ancestor directory; the authorized retry passed.
- Initial focused PostgreSQL run: 29 passed in 4.42 seconds. Expanded coverage subsequently passed in the full suite.
- Full PostgreSQL suite: **439 passed / 13 files**, 110.26 seconds, started 2026-10-11 19:36:50 UTC. Includes **35** new purchase cases and all 404 existing cases. Log: `.postgres-test/package-purchase-full-sql.log`.
- Migration rehearsal: exit 0, fresh/legacy/phone-history modes. Log: `.postgres-test/package-purchase-migrations.log`.
- Cleanup: independently rechecked the disposable database guard and zero package purchases, users, bookings, payments, packages, sports and wallet entries; stopped the local PostgreSQL server cleanly. Log: `.postgres-test/package-purchase-cleanup.log`.
- `npm run check`: exit 0; lint 0 errors/43 existing warnings, typecheck passed, **1,326 unit tests / 62 files** (40.41 seconds), regenerated Prisma 6.19.3 client, Next 16.4.0 build compiled in 31.2 seconds and generated 75 static pages. Log: `.postgres-test/package-purchase-check.log`.
- `git diff --check`: passed. No browser E2E rerun or hosted purchase success is implied by these results. Source publication and hosted verification follow below.

## Remaining Work

This module has no production caller and cannot collect money or make a package spendable. Still required: durable Stripe checkout attempts and recovery, test-mode destination-charge identity verification, current provider receipt reconciliation, refunds/account closure handling, paid credit issuance exactly once, owned-child atomic redemption, balance/history UI, retry/concurrency/refresh coverage, and actual hosted trainer onboarding/payment/payout proof.

The owner confirmed family-shared credits. Automatic cancellation credit restoration, expiry timing and partial mixed-service refunds still need policy resolution. No policy has been inferred from a test fixture or an unanswered question. Do not mark packages purchasable, activate an entitlement from a browser redirect, reuse single-session payment records for package redemption, or grant a second wallet payout.

Hosted trainer testing remains pending: the browser still showed Parent dashboard with one saved synthetic athlete when checked this turn. GitHub Actions billing was blocked on the preceding commit; fresh publication results must be checked separately. Production and full money-flow signoff remain **HOLD**.
