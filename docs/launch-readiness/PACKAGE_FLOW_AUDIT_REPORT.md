# Package Flow And Booking Contract Audit

## Identity

- Date: 2026-10-08 UTC. Baseline `a92204dcc6e52bd738f84549804105e664fd1115`, branch `codex/payment-readiness-20261006`. Source publication follows below.
- Environments: repository source; guarded disposable local PostgreSQL 16.15 (`trainr_audit_20261008`, role `trainr_test`, loopback 55439); built local app for focused browser regression. No production account or database write and no Stripe money movement.
- Accounts: synthetic parent/trainer `@example.test` fixtures. Package fixture: five sessions, 25,000 cents, 90 days, belonging to the same trainer/service as the requested booking. This is test data, not a verified commercial offer.
- Tested boundary: authenticated `POST /api/bookings`, `bookingSchema`, direct `createBooking`, request replay, coupon/notification/payment persistence. Source-inspected surfaces: both public trainer profiles, trainer profile/onboarding, parent dashboard, booking form, package/payment schema and API inventory.
- Overall verdict: **FAIL / INCOMPLETE for package purchase and entitlement flows**. The contract repair below is not package implementation and does not remove the original package requirement.

## Current Evidence

| Requirement | Authoritative evidence | Result |
| --- | --- | --- |
| Package catalog storage | `Package` and `PackageItem` models store title, price, validity and per-service counts; SQL fixture creates a valid package | Present locally; not a purchase ledger |
| Trainer package creation/editing | Trainer onboarding/profile request/UI paths expose services and availability but no package mutation; API file inventory contains no package purchase/management route | Missing |
| Parent package selection/purchase | Both public profile pages render package title/items/price/validity without a package purchase action; booking form sends only a service reservation | Missing |
| Purchase/payment identity | `Payment.bookingId` is mandatory and unique; no package purchase/payment-attempt model; `Booking.packageId` alone cannot represent a purchased credit balance | Missing |
| Credit redemption/expiry/refund history | No durable purchased entitlement, redemption, restoration or expiry ledger in the current schema/booking implementation | Missing |
| Parent refresh persistence | No package balance/history in the parent dashboard | Missing |
| Real Stripe package checkout/Connect/payout | Not attempted; no implemented package purchase path to exercise | Not verified |

This evidence is based on the actual schema, exports, route inventory and form code, not a claim that a text search alone proves runtime behavior. Single-session payment test results must not be reused as package-flow signoff.

## Reproduced Contract Defect

The booking schema accepted unknown properties by stripping them. An otherwise valid request carrying `packageId` was accepted as an ordinary service booking. Likewise, adding `packagePurchaseId` to a previously committed request could return the existing single-session reservation. A successful HTTP response therefore did not mean the requested purchase semantics were honored.

Before the repair, five unit cases (`packageId`, `packagePurchaseId`, `sessionCreditId`, `timeZone`, caller-supplied total) returned 201 where 400 was expected. Two authenticated real-SQL package/replay cases also failed with 201 rather than 400. Those tests used a real synthetic catalog package, not only an arbitrary absent ID. No Stripe call occurred.

## Repair And Retest

The existing booking schema is now strict. Unsupported fields return 400 with `Unsupported booking fields` at the API boundary; direct transaction-helper callers are also validated before any writes. The accepted single-session fields and server-calculated prices remain unchanged. This is a deliberate contract tightening: undocumented clients sending extra fields must use the supported contract, not assume package/credit/timezone data was accepted.

- Focused unit retest: **99 passed / 4 files**, including 18 booking API cases. No valid-input assertion was removed.
- Focused real-SQL retest: **15 passed**. A package request leaves zero bookings, booking request records, payments and notifications and does not consume its coupon. The direct helper rejects the same unsupported body. Adding purchase semantics to a committed request does not create/rewrite another booking or consume the coupon again.
- `npm run check` exited 0: lint (existing warnings), typecheck, **944 unit tests / 46 files** (11.01 seconds), regenerated Prisma client and production build (73 pages). No schema/dependency change.
- Rebuilt-client full SQL suite: **317 passed / 11 files**, zero failed/pending, 2026-10-08 **20:06:27-20:07:19 UTC**. JSON artifact: `test-results/package-contract-postgres-20261008.json`.
- Built app at `http://127.0.0.1:3107`, installed Edge, one worker: **14 passed in 1.3 minutes** across `booking-local-regression.spec.ts` and `booking-retry-local-regression.spec.ts`. Desktop/mobile supported requests still reserve once, retain failure/uncertain states, recover identical requests, preserve coupon use and reload persisted state. Artifacts: `test-results/package-contract-browser-20261008/`. These are single-session regressions, not package purchase tests or a rerun of the entire 18-file browser matrix.
- Stopped Next; verified exact database/user/disposable guard, zero users/bookings/payments/notifications/packages/package items/booking requests, and absence of the injected booking-request constraint. Stopped disposable PostgreSQL cleanly. No required local process remains running.

## Publication

Source commit/push and hosted/live observations follow after publication. Freshly fetched main remained `2067e743c54ffee669cd484f26dc472b157f1881`; no production promotion or settings change occurred.

## Required Next Work

Owner input requested: should purchased session credits belong to one selected child or be shared across that parent's children? No entitlement ownership was silently invented.

Package completion still requires trainer CRUD with validated owned service counts/pricing, immutable purchase terms, payment-attempt identity and current Stripe receipt verification, ownership-scoped atomic credit redemption, persisted booking linkage, expiry and cancellation/refund/credit policy, parent balance/history, migration rehearsal and end-to-end refresh/retry/concurrency tests. The advertised validity period is not permission to invent missing refund/expiry rules. Package payouts must use the defined Stripe destination-charge path without a second wallet payment.

Do not sell a package by charging an unrelated single booking or manually labeling a payment as package-paid. Existing package listings are not evidence of purchasability. Scheduling and cancellation decisions, isolated staging, production migration/backup review, actual Stripe test/live proof and correct-project rollout remain open. Production and money-flow signoff remain **HOLD**.
