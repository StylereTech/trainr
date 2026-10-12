# Account Checkout Closure Report

## Scope And Baseline

- Date: 2026-10-12 UTC / PDT. Baseline `d7fa5933b08a044f384477fa70b37e4169eb1f28`, clean checkout, audit branch `codex/payment-readiness-20261006`.
- Environments: owned disposable loopback PostgreSQL `trainr_audit_timezone_20261011`, port 55439; compiled local app for browser regression; planned isolated Vercel Preview only. Main, Production, Story, credentials, billing and real funds excluded.
- Accounts: generated `example.test` parent, trainer and administrator fixtures. Stripe responses are simulated. No real account is deleted or real checkout expired in this audit.
- Inspection finding: `closeAccount` revoked/anonymized the account and preserved financial relationships, but did not enqueue or close pre-existing checkout sessions. Existing in-flight checkout withholding was not sufficient for already-issued links.
- Surfaces: self-service DELETE `/api/account`; administrator PATCH `/api/admin/users`; new GET/POST `/api/admin/checkout-closures`; `/admin/checkout-closures`; booking/package checkout identities and account-deletion wording.

## Implementation

The additive migration creates a durable queue with one entry per booking payment or package purchase. Account closure inserts queue entries in the same transaction as access revocation. Either participant's closure creates the same unique work item; subsequent closure does not duplicate it. Historical records with deleted participants are queued without assuming Stripe closure. Financial records and bookings are not deleted or canceled by this change.

After the deletion transaction commits, the API attempts one queued item to bound latency; remaining work is visible under Users > Checkout closures. Failure cannot undo account deletion or silently remove queued work. Operators can verify and close each item through an administrator-only action, with current role/deletion revalidation and an audit record committed with the result.

Only existing provider session IDs are read. Missing/unattached identities remain REVIEW; no replacement checkout or new charge is created. Identity, amount, mode, currency, recovery settings and linked local intent are checked before expiring an open unpaid session. A lost expire response prompts a fresh provider read. CLOSED requires an expired unpaid session, no recorded financial activity and either no intent or a verified canceled intent. Paid, processing, recoverable, mismatched or unavailable evidence remains REVIEW. This is not a refund, payout, booking cancellation or financial settlement signoff.

The operator surface has loading/empty/error states, bounded pagination, role protection and persisted-state reload after uncertain actions. Account deletion now warns that payment/refund review may remain and does not accept malformed success acknowledgements.

Provider contract checked against official [Checkout Session expiry](https://docs.stripe.com/api/checkout/sessions/expire) and [idempotent requests](https://docs.stripe.com/api/idempotent_requests). Expiry is restricted to open sessions; ambiguous provider results are read again instead of interpreted as success.

## Verification

| Steps | Expected | Actual |
| --- | --- | --- |
| Close parent or trainer with booking and package checkout; close/replay the other participant | Two durable work items, financial history retained, no duplicate | PASS, focused SQL |
| Throw after queue insertion and anonymization | Account and queue roll back together | PASS, focused SQL |
| Run three closure requests concurrently for either kind | One verified expiry, stable CLOSED result, no money writes | PASS, focused SQL |
| Present paid/processing/recoverable/mismatched or unavailable sessions | REVIEW; never falsely CLOSED | PASS, 14 focused SQL cases |
| Lose provider expiry response | Fresh read verifies actual outcome | PASS, both financial kinds |
| Return canceled, processing or wrong linked intent | CLOSED only for verified canceled identity | PASS, six focused SQL cases |
| Supply expired link with recorded financial activity | Financial review stays required | PASS, both kinds |
| Leave original session unattached, then attach late identity | REVIEW first; verified closure on retry | PASS, focused SQL |
| Fail real audit constraint after provider expiry | Queue transaction rolls back; retry reads existing expiry | PASS, focused SQL |
| Revoke admin / use unrelated authority / send unknown action or invalid query | Deny before provider work | PASS, focused SQL |

- Focused SQL: **34 passed**, 22.26s, start **08:16:31 UTC**, exit 0; `.postgres-test/account-closures-focused-sql.log`.
- Full SQL: **682 passed / 15 files**, 177.16s, start **08:17:42 UTC**, exit 0; `.postgres-test/account-closures-full-sql.log`. TypeScript passed; focused source/test lint passed with exit 0.
- Applied and staged migration SHA-256 match: `3ed618ee1ed2933407553183b8f04e54ed21d02a2ea7970892579da2ae7d28c3`. Applied migration is unchanged.
- Migration rehearsal: fresh, legacy, phone-history and closed-account-history modes all PASS; 19 checksums, 15 SQL-only constraints and five triggers verified, schema parity and no-op replay passed. Historical closure mode backfilled exactly one booking payment and one package purchase as PENDING, while preserving all 12 legacy financial/profile tables. Four owned rehearsal databases removed. Exit 0; `.postgres-test/account-closures-migrations.log`. A fixture service-type spelling was corrected to INDIVIDUAL during the run; queue backfill does not read service type. No migration SQL changed.
- Post-SQL guard/count check: users, bookings, payments, purchases and closure tasks all zero in the owned disposable database.
- Full `npm run check`: PASS, exit 0; lint zero errors / 42 existing warnings, TypeScript, **1,407 units / 65 files** (23.48s) and optimized 81-page build passed. Build compilation 49s and build TypeScript 39.1s; `.postgres-test/account-closures-check.log`. Focused final test/rehearsal lint also passed.
- First compiled browser run: **16 passed / six failed**, 5.2m, exit 1; `.postgres-test/account-closures-browser.log`. All six account-deletion acknowledgement cases and four existing administrator user-management cases passed. The six queue failures were strict-selector collisions between the intended alert and Next.js's route announcer. Assertions now filter for the intended error text; application alerts were present and not removed to satisfy tests.
- Separate geometry baseline against that pre-fix compiled app: **two failed**, exit 1; `.postgres-test/account-closures-layout-baseline.log`. Desktop sidebar left edge was **-24px** instead of >=0; mobile heading left edge was **0px** instead of >=16. P2: shared admin layout's negative margins escaped the unpadded root layout. Removed those margins; retained before screenshots below. Closure and deletion requests also now have finite 40s/45s client deadlines and use the existing unconfirmed-result state on timeout.
- P2 SQL defense finding: PostgreSQL CHECK's NULL semantics allowed direct CLOSED writes with a missing outcome; an empty session identity also passed. Two added regression cases failed before correction (34 skipped), start **08:41:20 UTC**, exit 1; `.postgres-test/account-closures-proof-baseline.log`. Applied migration 19 was not edited. Additive migration 20 requires a nonempty identity, checked timestamp and exact `expired_unpaid` outcome. Its SHA-256 is `6190a6d0ad0f1370fafea3e8ad13992e04e58171c318ba1085123aa012c3b973`. Focused retest: **two passed / 34 skipped**, 6.03s, start **08:42:34 UTC**, exit 0; `.postgres-test/account-closures-proof-retest.log`.
- Final full SQL after that correction: **684 passed / 15 files**, 168.82s, start **08:43:27 UTC**, exit 0; `.postgres-test/account-closures-final-sql.log`.
- Final migration rehearsal after migration 20: **all four modes PASS**, exit 0; `.postgres-test/account-closures-final-migrations.log`. All 20 checksums, schema parity, no-op replay, 15 constraints and five triggers verified. Historical records were preserved and exactly two financial targets were backfilled as PENDING. All four owned rehearsal databases were removed. Focused lint on changed tests and rehearsal code also passed, exit 0.
- Final full `npm run check` after both migrations and the layout fix: **PASS**, exit 0; lint zero errors / 42 existing warnings, TypeScript, **1,408 units / 65 files** (30.58s, start **08:51:53 UTC**) and optimized 81-page build passed. Compilation 18.3s, build TypeScript 8.1s; `.postgres-test/account-closures-complete-check.log`. File/staged SHA-256 matches were independently verified for both new migrations.
- Final compiled browser retest: **24 passed**, 1.7m, exit 0; `.postgres-test/account-closures-browser-retest.log`. Includes 12 queue cases, six real/simulated deletion acknowledgement cases, four existing administrator user-action cases and two layout geometry checks across 1440px/390px. Browser queue mutation responses are explicit synthetic fixtures; provider identity/expiry behavior is tested in SQL with simulated Stripe. No actual Stripe request is claimed.
- Independent post-browser SQL check: correct disposable database/user/guard marker; users, bookings, payments, purchases and closure tasks all **zero**. Both applied migration hashes equal the file/staged hashes. Owned local app and PostgreSQL were stopped after verification.
- Hosted publication evidence pending. Unexecuted gates are not passes.

## Visual Evidence

- [Before desktop](evidence/account-checkout-closures/before-desktop.png): left sidebar clipping.
- [Before mobile](evidence/account-checkout-closures/before-mobile.png): content flush against the clipped left edge.
- [After desktop](evidence/account-checkout-closures/after-desktop.png): sidebar and content inside viewport; visually inspected.
- [After mobile](evidence/account-checkout-closures/after-mobile.png): heading wraps cleanly with 16px inset; controls and references do not overflow; visually inspected.

## Remaining Gates

Non-deletion role/activity revocation still needs equivalent review of previously issued checkout links. Existing late-payment holds prevent fulfillment, but are not proof that every outstanding provider link has been retired.

This is a bounded automatic attempt plus a manual v1 queue, not a background worker guarantee. Operators must review all remaining PENDING/REVIEW entries, reconcile unattached original requests and use the existing financial-review process for completed payments. No automatic refund, transfer reversal, dispute disposition or payout is implemented by closure. Hosted trainer/Stripe money-flow proof, shared-credit redemption/policy decisions and the other launch gates remain open. Signed-in hosted retesting remains pending owner approval after the preceding browser approval-service rate limit. Overall production and money-flow signoff: **HOLD**.
