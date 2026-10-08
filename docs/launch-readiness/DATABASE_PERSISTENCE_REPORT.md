# Database Persistence Report

2026-10-08 inbox follow-up (baseline `f1411a8b60a550754fcea654ea482400a13bdd7a`): [Notification Inbox And Financial Review Delivery](NOTIFICATION_INBOX_REPORT.md) records the protected inbox, recipient/role controls, explicit read-state actions and exact verification/publication evidence. This supersedes the earlier missing-inbox finding only to the extent tested there; email/push delivery and real Stripe/live payout signoff remain unproven. Overall production status remains **HOLD**.

2026-10-08 post-settlement update: platform transfer, application-fee and dispute lifecycle events now resolve current provider relationships and invoke full settlement verification. Current dispute history and sanitized financial observations drive replay-safe party/active-admin review notices, including after full customer refunds. No money movement or automatic dispute resolution is performed. Baseline `5cfc90fdb0b5da5e6f13f77f678bb1c9f15764c5`; [reproduced failures, tests, required webhook subscriptions and publication proof](POST_SETTLEMENT_EVENT_REPORT.md). Provider reads are simulated locally; production rollout and real money-flow proof remain HOLD.

2026-10-08 destination settlement update: paid events and checkout recovery now verify the immutable destination, captured charge, gross transfer and application-fee receipt before booking confirmation. Verified transfer IDs are persisted; refund/reversal/dispute observations require review. Legacy payments without saved destination evidence are held for reconciliation. Baseline `23e5995ed1602b2cd2c5199b36c1872e615c4619`; [exact provider semantics, SQL/signature tests, operator steps and final publication evidence](DESTINATION_SETTLEMENT_REPORT.md). Stripe receipts are simulated locally; real transfer and bank payout proof remain open. Production HOLD.

2026-10-08 Checkout revocation update: current buyer authority is locked/rechecked before payment preparation and after Stripe responds; returned session identities survive access changes, URLs are withheld, and open/unpaid sessions receive a bounded expiry attempt. No refund, automatic cancellation or guaranteed closure is implied. Baseline `4df968e5d09b3f44678b948b4c5e1f4dd6b3d02a`; [exact failures/retests, operator reconciliation and limits](CHECKOUT_ACCOUNT_REVOCATION_REPORT.md). Existing-link sweeps and real Stripe/staging proof remain open. Production HOLD.

2026-10-08 booking-action authorization update: booking mutations now lock and revalidate the current actor before changing state, preventing requests queued behind role change/deactivation from using stale authority. Baseline `925e3bee41626b0a6e429071a76523cedb31bc5a`; [reproduction, real SQL race proof, retests and publication](BOOKING_ACTION_AUTHORIZATION_REPORT.md). Scheduling time zones and real Stripe/staging proof remain open. Production HOLD.

2026-10-08 shared-auth-throttle update: database-backed sliding limits replace process-local counters; credential login now has IP and normalized-account budgets. Trusted ingress is Vercel-specific, storage failures deny requests, and raw IP/email is not stored in the limiter table. Baseline `c193cfe52453c3fff0550418870944d08c509bef`; [exact policy, initial IPv6 failure/retest, migration, final tests and publication](SHARED_AUTH_RATE_LIMIT_REPORT.md). Ingress/load validation and broader abuse defenses remain open. No production promotion or live money-flow signoff. Production HOLD.

2026-10-08 account-token update: pending verification/reset links now use purpose-separated digests and server-key-dependent resend seeds rather than stored bearer values. Baseline `f2c9fff915e586b9b13c638691e6ce985fa31d80`; [exact tests, migration invalidation/rollout requirements, final retest and publication](ACCOUNT_TOKEN_SECURITY_REPORT.md). This supersedes the prior raw-token storage finding locally, not in production. External delivery, distributed rate limits, staging and live money-flow proof remain open. Production HOLD.

2026-10-08 booking-retry update: parent-scoped request tracking now recovers one saved reservation after an uncertain response, without spending the coupon or creating payment/notification records again. Current parent access is rechecked under transaction locks; cancelled/free recoveries do not open checkout. Baseline `0885c90500f012529be0b0d84a7ad8beb5d3d9ec`; **737 unit, 199 real local SQL and 8 focused browser checks passed**. [Exact steps, fixture failure/retest, full-browser/publication evidence and required migration](BOOKING_RETRY_INTEGRITY_REPORT.md). Stripe checkout is simulated locally. Timezone/past-start rules, pending holds, package entitlements, staging and live money-flow proof remain open. Production HOLD.

2026-10-08 athlete-profile update: owned create/edit/delete flows now validate calendar dates and active sports, serialize mutations, reject stale edits and preserve booked history. A durable creation request/tombstone prevents same-key duplicate saves or resurrection. Baseline `60c68fbf98c6e6472b0dbd2966dabdd5afd8a1ca`; **735 unit and 186 real local SQL tests passed**. [Exact routes, accounts, initial deadlock/test-selector failures, browser retests, migration requirements and publication evidence](ATHLETE_PROFILE_REPORT.md). New migration tested only on the disposable database. Child-data retention, cross-navigation retry recovery and all staging/live money-flow gates remain open. Production HOLD.

2026-10-08 cancellation/Checkout update: cancellation now attempts provider-session expiry after committing the booking; an in-flight creation keeps its durable identity and withholds the URL. Recovery uses the original bounded idempotency key, and paid/ambiguous outcomes remain under review. Admins can retry closure for cancelled bookings. Baseline `5a0700b76f074c12b9e74347cab24f47ae4b5b0e`; [exact tests, failures, retests and publication proof](CANCELLATION_CHECKOUT_REPORT.md). Stripe is simulated locally. Refund execution, automatic recovery scheduling and full live money-flow signoff remain open. Production HOLD.

2026-10-08 account/email audit: registration and trainer notices are now atomic; verification/recovery call Resend with bounded requests, explicit failure states and retryable persisted tokens. Verification is an explicit one-time POST, with role-aware signup and signed-in recovery tested locally. Baseline `8652e4c50674ec461eecfe6e7e3e1550651529b6`; **678 unit and 152 real local SQL tests passed**. [Exact steps, browser/build evidence, initial failures and remaining gates](ACCOUNT_EMAIL_REGISTRATION_REPORT.md). External email delivery, token-storage hardening, child-profile completeness and all live money-flow/rollout gates remain open. Production readiness HOLD.

2026-10-08 verification audit: `db:check` previously tested TCP only; it now requires authenticated `SELECT 1`, bounded execution and redacted diagnostics. This still does not prove schema or durable writes. Preview lacks database configuration, and full migration bootstrap/drift rehearsal remains open. [Exact steps and final retest](DEPLOYMENT_CONFIGURATION_REPORT.md). Production persistence/rollout signoff remains HOLD.

2026-10-08 Connect identity update: both setup endpoints now preserve existing Stripe account IDs and share a durable, bounded-idempotency creation attempt. Ambiguous/expired creation requires reconciliation, not replacement; provider failures no longer expose cached readiness as current truth. Dashboard status is schema-validated and retryable; creation email is redacted on success or closure. Baseline `0eab36674bbbfaf75d84d0671f0ca30869771a16` plus this commit. **644 unit tests and 134 real local PostgreSQL tests passed**; exact routes, accounts, initial failures, migration/ops requirements and final browser/build/publication evidence are in the [Connect identity report](CONNECT_ACCOUNT_IDENTITY_REPORT.md). Stripe is simulated. No production migration/promotion or real money movement; full readiness and money-flow signoff remain HOLD.

2026-10-08 dashboard data update: parent/trainer booking counts and history are now role-scoped and paginated from a consistent SQL snapshot. Failed/malformed reads show explicit errors, trainer actions reload persisted state, and booked allocations are no longer presented as total earnings. Stripe balances remain provider-sourced with unknown/error states. Baseline `0dfd7a19e9155facc7be7a95e41cb741fb5ba0be` plus this commit; **634 unit tests and 114 real local SQL tests passed**. Exact routes, accounts, steps, initial failures, browser retest and publication evidence are in the [dashboard integrity report](DASHBOARD_DATA_INTEGRITY_REPORT.md). External Stripe observations in tests are simulated. No real charge/refund/transfer/payout, production migration or production promotion occurred; full production and money-flow signoff remain HOLD.

2026-10-08 refund reconciliation update: per-refund provider observations now separate successful, pending and failed/cancelled outcomes; legacy totals require verification. Reconciliation is transactional with notices/audit, handles signed lifecycle events and exposes an admin read-only Stripe refresh. Baseline `0cfb4f550b88271d273bb4e744e44ca82fedfbf6` plus this commit. **613 unit tests, 106 real local SQL tests, production build and six focused desktop/mobile refund browser checks passed**. Exact accounts, steps, routes, expectations, actual results, initial disk failure, retest and final broader-browser/publication evidence are in the [refund audit](REFUND_RECONCILIATION_REPORT.md). Stripe reads are simulated locally; production smoke was anonymous and on older code. No real refund/transfer/payout or production migration occurred. Full production/money-flow signoff remains HOLD; this is not refund execution or Connect/payout verification.

2026-10-08 administrator-account update: **63/63 real local PostgreSQL tests passed** in the final SQL rerun. Thirteen admin cases cover concurrent last-admin preservation, stale revisions, audit-failure rollback, profile provisioning, retained booking/payment identity, deactivated login/role/listing rejection and fresh actor checks. Additive `deletedAt` migration applied only to guarded disposable SQL. Baseline `fb5f2489645507eb86307070e254091343390d20` plus this commit; [exact steps and final cleanup](ADMIN_ACCOUNT_INTEGRITY_REPORT.md). No production schema or money movement proof.

2026-10-08 session persistence update: **50/50 local PostgreSQL tests passed**. The new ten-case actual-cookie suite verifies version constraint, reset consumption/concurrency, password replacement, role-change rejection and anonymized account revocation. Migration `20261008070000_add_session_version` applied only to the guarded disposable database. Baseline `6ba2929e0432faca904dbdfdbdaa439f896104fe` plus this commit; [exact steps, cleanup and final retest](SESSION_REVOCATION_REPORT.md). Staging/production migration history, rollout and real financial persistence remain unverified.

2026-10-08 approval/checkout update: **40/40 real local PostgreSQL tests passed**, including approval/audit/notification rollback, competing review revisions, revoked admin role, reservation eligibility, and retained provider identity after suspension during checkout. Independent users/audit/notification/booking counts all zero after cleanup; cluster stopped. Baseline `4a6f76a6a0996f1911e6e6d5a5d47251cefef964` plus this commit; [exact evidence and limits](TRAINER_APPROVAL_INTEGRITY_REPORT.md). No production schema/data change or real Stripe settlement proof.

2026-10-08 service-sport update: **28 real local PostgreSQL tests passed**, including actual profile handler persistence, preservation of historical booking sport associations through offering versioning, wrong-sport athlete rejection, null/inactive/removed sport rejection and transactional rollback. Baseline `90f5d92d2000506c253928e649741b412f08c6a7` plus this commit; synthetic accounts only. Independent cleanup readback and full steps are in the [checkpoint](AUDIT_CHECKPOINT_2026-10-06.md). This does not establish production migration or Stripe persistence success.

## Current Local SQL Evidence: 2026-10-08

At 04:49-04:52 UTC, the audit branch passed 12 integration tests against disposable PostgreSQL 16.15, with real independent connections, row-lock waiting, migration constraints, atomic rollback and committed readback. Baseline source: `ac7c579e1fcd5af6fc06f11b5678a458aec25766`; harness and exact steps/accounts/results are in [PostgreSQL integration verification](POSTGRES_INTEGRATION_REPORT.md). Synthetic accounts only; Stripe was mocked. Fixture cleanup was independently verified. **PASS for these local SQL cases only.** Production migration, production write persistence, real provider behavior and final readiness remain unverified. Historical results below do not override these limits.

> 2026-10-06 audit supersedes the readiness conclusions below. See [current checkpoint](AUDIT_CHECKPOINT_2026-10-06.md) for baseline SHA, environment, exact checks, fixes, open defects, and retest status. This document's April results are historical and do not establish current production readiness. Money movement is NOT signed off; fixable repository blockers remain.

- Date/time: 2026-04-24 00:55 UTC / 2026-04-23 17:55 America/Los_Angeles
- Environment tested: live production `https://trainr.cc`, local shell
- Commit SHA tested: final pushed commit `71edba76ac7070856ab5a1cffed0b40c9ea8a652`
- Accounts used: parent `jennifer.davis@email.com`, admin `admin@trainr.app`

## Routes And Endpoints Tested
- `/api/health`
- `/api/athletes`
- `/api/bookings`
- `/api/admin/bookings`
- Prisma schema in `prisma/schema.prisma`

## Steps
1. Called live `/api/health`.
2. Logged in as parent and fetched athletes/bookings.
3. Logged in as admin and fetched recent bookings.
4. Ran local Prisma generate/build.

## Expected Result
Production DB is connected, schema builds, and parent/admin reads show persisted records after refresh/API reload.

## Actual Result
- `/api/health` returned `ok: true` and `dbConnected: true`.
- Parent athletes persisted and returned two demo athlete records.
- Parent/admin booking reads returned persisted bookings.
- Local `scripts/db-check.mjs` failed because local `DATABASE_URL` is not set.

## Pass/Fail
Pass for live database persistence. Local DB check blocked by missing local environment variable.

## Blocker Status
Local-only env blocker: no `DATABASE_URL` in shell. Live DB is connected.

## Fix Status
No schema change required.

## Retest Proof
Local `npm run build` generated Prisma client and built successfully. Live health/API probes returned persisted data.
