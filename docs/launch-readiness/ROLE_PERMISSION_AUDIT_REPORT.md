# Role Permission Audit Report

2026-10-08 migration follow-up (baseline `ba6fb20def90af42669ceee589bdf657b0d8cf5c`): [Migration Bootstrap And Upgrade Rehearsal](MIGRATION_BOOTSTRAP_REPORT.md) records the reproduced empty-database failure, historical baseline repair, guarded fresh/legacy rehearsals, exact tests and publication evidence. This supersedes the missing-baseline finding only. Actual production schema/ledger review, tested backups, isolated staging and real Stripe checkout/Connect/payout verification remain open; production and money-flow signoff remain **HOLD**.

2026-10-08 inbox follow-up (baseline `f1411a8b60a550754fcea654ea482400a13bdd7a`): [Notification Inbox And Financial Review Delivery](NOTIFICATION_INBOX_REPORT.md) records the protected inbox, recipient/role controls, explicit read-state actions and exact verification/publication evidence. This supersedes the earlier missing-inbox finding only to the extent tested there; email/push delivery and real Stripe/live payout signoff remain unproven. Overall production status remains **HOLD**.

2026-10-08 post-settlement update: platform transfer, application-fee and dispute lifecycle events now resolve current provider relationships and invoke full settlement verification. Current dispute history and sanitized financial observations drive replay-safe party/active-admin review notices, including after full customer refunds. No money movement or automatic dispute resolution is performed. Baseline `5cfc90fdb0b5da5e6f13f77f678bb1c9f15764c5`; [reproduced failures, tests, required webhook subscriptions and publication proof](POST_SETTLEMENT_EVENT_REPORT.md). Provider reads are simulated locally; production rollout and real money-flow proof remain HOLD.

2026-10-08 Checkout revocation update: current buyer authority is locked/rechecked before payment preparation and after Stripe responds; returned session identities survive access changes, URLs are withheld, and open/unpaid sessions receive a bounded expiry attempt. No refund, automatic cancellation or guaranteed closure is implied. Baseline `4df968e5d09b3f44678b948b4c5e1f4dd6b3d02a`; [exact failures/retests, operator reconciliation and limits](CHECKOUT_ACCOUNT_REVOCATION_REPORT.md). Existing-link sweeps and real Stripe/staging proof remain open. Production HOLD.

2026-10-08 booking-action authorization update: booking mutations now lock and revalidate the current actor before changing state, preventing requests queued behind role change/deactivation from using stale authority. Baseline `925e3bee41626b0a6e429071a76523cedb31bc5a`; [reproduction, real SQL race proof, retests and publication](BOOKING_ACTION_AUTHORIZATION_REPORT.md). Scheduling time zones and real Stripe/staging proof remain open. Production HOLD.

2026-10-08 shared-auth-throttle update: database-backed sliding limits replace process-local counters; credential login now has IP and normalized-account budgets. Trusted ingress is Vercel-specific, storage failures deny requests, and raw IP/email is not stored in the limiter table. Baseline `c193cfe52453c3fff0550418870944d08c509bef`; [exact policy, initial IPv6 failure/retest, migration, final tests and publication](SHARED_AUTH_RATE_LIMIT_REPORT.md). Ingress/load validation and broader abuse defenses remain open. No production promotion or live money-flow signoff. Production HOLD.

2026-10-08 account-token update: pending verification/reset links now use purpose-separated digests and server-key-dependent resend seeds rather than stored bearer values. Baseline `f2c9fff915e586b9b13c638691e6ce985fa31d80`; [exact tests, migration invalidation/rollout requirements, final retest and publication](ACCOUNT_TOKEN_SECURITY_REPORT.md). This supersedes the prior raw-token storage finding locally, not in production. External delivery, distributed rate limits, staging and live money-flow proof remain open. Production HOLD.

2026-10-08 booking-retry update: parent-scoped request tracking now recovers one saved reservation after an uncertain response, without spending the coupon or creating payment/notification records again. Current parent access is rechecked under transaction locks; cancelled/free recoveries do not open checkout. Baseline `0885c90500f012529be0b0d84a7ad8beb5d3d9ec`; **737 unit, 199 real local SQL and 8 focused browser checks passed**. [Exact steps, fixture failure/retest, full-browser/publication evidence and required migration](BOOKING_RETRY_INTEGRITY_REPORT.md). Stripe checkout is simulated locally. Timezone/past-start rules, pending holds, package entitlements, staging and live money-flow proof remain open. Production HOLD.

2026-10-08 athlete-profile update: owned create/edit/delete flows now validate calendar dates and active sports, serialize mutations, reject stale edits and preserve booked history. A durable creation request/tombstone prevents same-key duplicate saves or resurrection. Baseline `60c68fbf98c6e6472b0dbd2966dabdd5afd8a1ca`; **735 unit and 186 real local SQL tests passed**. [Exact routes, accounts, initial deadlock/test-selector failures, browser retests, migration requirements and publication evidence](ATHLETE_PROFILE_REPORT.md). New migration tested only on the disposable database. Child-data retention, cross-navigation retry recovery and all staging/live money-flow gates remain open. Production HOLD.

2026-10-08 cancellation/Checkout update: cancellation now attempts provider-session expiry after committing the booking; an in-flight creation keeps its durable identity and withholds the URL. Recovery uses the original bounded idempotency key, and paid/ambiguous outcomes remain under review. Admins can retry closure for cancelled bookings. Baseline `5a0700b76f074c12b9e74347cab24f47ae4b5b0e`; [exact tests, failures, retests and publication proof](CANCELLATION_CHECKOUT_REPORT.md). Stripe is simulated locally. Refund execution, automatic recovery scheduling and full live money-flow signoff remain open. Production HOLD.

2026-10-08 account/email audit: registration and trainer notices are now atomic; verification/recovery call Resend with bounded requests, explicit failure states and retryable persisted tokens. Verification is an explicit one-time POST, with role-aware signup and signed-in recovery tested locally. Baseline `8652e4c50674ec461eecfe6e7e3e1550651529b6`; **678 unit and 152 real local SQL tests passed**. [Exact steps, browser/build evidence, initial failures and remaining gates](ACCOUNT_EMAIL_REGISTRATION_REPORT.md). External email delivery, token-storage hardening, child-profile completeness and all live money-flow/rollout gates remain open. Production readiness HOLD.

2026-10-08 Connect identity update: both setup endpoints now preserve existing Stripe account IDs and share a durable, bounded-idempotency creation attempt. Ambiguous/expired creation requires reconciliation, not replacement; provider failures no longer expose cached readiness as current truth. Dashboard status is schema-validated and retryable; creation email is redacted on success or closure. Baseline `0eab36674bbbfaf75d84d0671f0ca30869771a16` plus this commit. **644 unit tests and 134 real local PostgreSQL tests passed**; exact routes, accounts, initial failures, migration/ops requirements and final browser/build/publication evidence are in the [Connect identity report](CONNECT_ACCOUNT_IDENTITY_REPORT.md). Stripe is simulated. No production migration/promotion or real money movement; full readiness and money-flow signoff remain HOLD.

2026-10-08 dashboard data update: parent/trainer booking counts and history are now role-scoped and paginated from a consistent SQL snapshot. Failed/malformed reads show explicit errors, trainer actions reload persisted state, and booked allocations are no longer presented as total earnings. Stripe balances remain provider-sourced with unknown/error states. Baseline `0dfd7a19e9155facc7be7a95e41cb741fb5ba0be` plus this commit; **634 unit tests and 114 real local SQL tests passed**. Exact routes, accounts, steps, initial failures, browser retest and publication evidence are in the [dashboard integrity report](DASHBOARD_DATA_INTEGRITY_REPORT.md). External Stripe observations in tests are simulated. No real charge/refund/transfer/payout, production migration or production promotion occurred; full production and money-flow signoff remain HOLD.

2026-10-08 refund reconciliation update: per-refund provider observations now separate successful, pending and failed/cancelled outcomes; legacy totals require verification. Reconciliation is transactional with notices/audit, handles signed lifecycle events and exposes an admin read-only Stripe refresh. Baseline `0cfb4f550b88271d273bb4e744e44ca82fedfbf6` plus this commit. **613 unit tests, 106 real local SQL tests, production build and six focused desktop/mobile refund browser checks passed**. Exact accounts, steps, routes, expectations, actual results, initial disk failure, retest and final broader-browser/publication evidence are in the [refund audit](REFUND_RECONCILIATION_REPORT.md). Stripe reads are simulated locally; production smoke was anonymous and on older code. No real refund/transfer/payout or production migration occurred. Full production/money-flow signoff remains HOLD; this is not refund execution or Connect/payout verification.

2026-10-08 administrator-account update: role changes, active-admin checks, profile creation, session revocation and audit insertion now share a transaction. Concurrent self-demotions/cross-deactivations retain an active admin. Deactivated accounts cannot log in, change roles, enable trainer listings or act as trainer-approval administrators. Admin hard deletion is replaced with audited closure that retains financial history. Baseline `fb5f2489645507eb86307070e254091343390d20` plus this commit; [exact SQL/browser evidence and limits](ADMIN_ACCOUNT_INTEGRITY_REPORT.md). Production rollout and broader security review remain incomplete.

2026-10-08 session-revocation update: API identity and NextAuth sessions now verify the current database role and session version. Password reset, self-deletion and role changes revoke older cookies; legacy cookies require fresh login. The legacy admin user listing excludes credential/reset fields. Baseline `6ba2929e0432faca904dbdfdbdaa439f896104fe` plus this commit. Exact account/route steps, real SQL/browser retests and production limitations: [session audit](SESSION_REVOCATION_REPORT.md). Admin mutation atomicity and last-admin races remain open; production is not yet remediated by this local patch.

2026-10-08 trainer-decision update: the mutation checks and holds the administrator's actual database role inside its transaction. Tests keep a synthetic ADMIN session after database role revocation and verify 403 without changes. Missing/non-admin sessions and malformed inputs also reject. **This is scoped to trainer-decision writes, not a completed platform-wide session/revocation audit.** [Source, exact steps and retest proof](TRAINER_APPROVAL_INTEGRITY_REPORT.md).

2026-10-08 public-data update: anonymous browse/search now query explicit public trainer/relation fields; public reviews no longer query parent account/email identifiers, and both profile pages display anonymous parent attribution. Source baseline `83fba060b23a73af95732668c2904422092a3127` plus this commit. **29 focused tests and 29 real local PostgreSQL tests passed**, with populated synthetic private fields, hidden reviews and inactive trainers. Exact steps, production-sample limits and final build/browser proof are in the [checkpoint](AUDIT_CHECKPOINT_2026-10-06.md). This does not complete the broader permission/privileged-session audit or prove production remediation.

> 2026-10-06 audit supersedes the readiness conclusions below. See [current checkpoint](AUDIT_CHECKPOINT_2026-10-06.md) for baseline SHA, environment, exact checks, fixes, open defects, and retest status. This document's April results are historical and do not establish current production readiness. Money movement is NOT signed off; fixable repository blockers remain.

- Date/time: 2026-04-24 00:55 UTC / 2026-04-23 17:55 America/Los_Angeles
- Environment tested: live production `https://trainr.cc`
- Commit SHA tested: final pushed commit `71edba76ac7070856ab5a1cffed0b40c9ea8a652`
- Accounts used: parent `jennifer.davis@email.com`, trainer `marcus.johnson@email.com`, admin `admin@trainr.app`

## Routes And Endpoints Tested
- `/parent/dashboard`
- `/trainer/dashboard`
- `/trainer/onboarding`
- `/trainer/profile`
- `/admin`
- `/admin/users`
- `/messages`
- `/api/trainer/onboarding`
- `/api/trainer/stripe-connect`
- `/api/admin/bookings`
- `/api/admin/coupons`
- `/api/trainer/wallet/withdraw`

## Steps
1. Ran role-boundary Playwright suite against live production.
2. Verified unauthenticated redirects.
3. Verified parent blocked from trainer surfaces.
4. Verified trainer blocked from admin surfaces.
5. Verified API role checks.

## Expected Result
Protected pages redirect unauthenticated users and role-scoped APIs reject cross-role access.

## Actual Result
27/27 role-boundary tests passed.

## Pass/Fail
Pass.

## Blocker Status
None for tested role boundaries.

## Fix Status
Reduced admin users API response to avoid exposing credential/token fields to the admin browser.

## Retest Proof
Live role-boundary suite passed. Local `npm run check` passed after admin API fix.
