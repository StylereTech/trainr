# Refund Destination Verification

## Scope

- Date: 2026-10-11; initial reproduction at approximately 17:01 UTC.
- Baseline commit: `46d8d78a1ed16902f91b042862a24e166f88680c`, branch `codex/payment-readiness-20261006`.
- Environment: Windows Node 22, disposable loopback PostgreSQL `trainr_audit_timezone_20261011`, role `trainr_test`, guard `disposable integration database`; later publication is audit Preview only.
- Accounts: generated local parent, trainer and admin fixtures using `example.test`; no real account, credentials or money movement.
- Surfaces: shared refund reconciliation, POST `/api/admin/refunds`, signed POST `/api/payments/webhook`, payment/refund persistence, booking terminal states, notices and operator audit.
- Expected: refund refresh cannot establish successful payment or refund state from a receipt that fails the agreed destination/split checks. Failures preserve existing records and remain retryable.

## Proven Finding

Priority **P1**: refund reconciliation checked charge identity and amounts but bypassed the full destination settlement verifier. With a stored intent ID, empty refund history could promote PENDING or FAILED to SUCCEEDED even when the actual synthetic transfer went to a different account. A signed early-refund test also accepted the wrong destination and returned 200 instead of 409. A valid early refund did not retain its transfer identity.

Exact baseline: six new real-SQL tests failed, with 100 unrelated cases excluded by the focused test filter. Evidence: `.postgres-test/refund-destination-baseline.log`. The verifier and webhook signature handling are real; only provider receipts are simulated. No exploit or money movement was attempted on a hosted account.

## Repair

Refund reconciliation now invokes the existing full verifier while the booking/payment locks are held, before changing refund records. It checks the immutable checkout attempt, PaymentIntent, captured charge, destination transfer, application fee and current dispute observations. Verified charge/transfer IDs are persisted with the refund state. Destination/history conflicts become 409; unexpected provider failures remain retryable, with the transaction rolled back.

The transaction timeout is 45 seconds rather than 25 to allow the added bounded read chain. Individual provider calls retain four-second timeouts and no network retries; the route's existing 60-second ceiling and five-second lock-wait bound remain. Slow or excessive history still fails closed. No new Stripe create/update/refund/transfer/payout operation is introduced.

This follows the existing TRAINR receipt contract. Stripe documents destination charges and application-fee transfers separately from customer refunds, and refund objects carry their own statuses and optional reversal references: [destination charges](https://docs.stripe.com/connect/destination-charges?platform=web&ui=stripe-hosted), [refund object](https://docs.stripe.com/api/refunds/object). A refund observation alone is not a trainer bank-payout receipt.

Two additional SQL regressions reproduced an empty-history false-paid state and missing operator audit when a transfer was first verified. A charge reporting refunds with no detailed refund history now returns a retryable conflict before mutation; subsequent complete history can reconcile normally. Newly verified financial IDs count as changes and are included in the operator audit, without inventing customer refund notices. Repeated identical refreshes do not duplicate that audit.

## Test Ledger

| Check | Result | Evidence |
| --- | --- | --- |
| Initial negative/early-event reproduction | Six failures before repair | `.postgres-test/refund-destination-baseline.log` |
| Real verifier, signed webhooks, SQL and existing refund-state suite | 149 passed across two files, 12.16s, exit 0 | `.postgres-test/refund-destination-focused.log` |
| Missing refund history and new transfer-identity audit baseline | Two failures, 106 unrelated filtered cases | `.postgres-test/refund-history-baseline.log` |
| Final focused verification, including history recovery and audit replay | 151 passed / two files, 14.47s, exit 0 at 17:09 UTC | `.postgres-test/refund-destination-final-focused.log` |
| Final lint/type/unit/build | Exit 0; 43 existing lint warnings, zero errors; 1,297 units / 61 files; 75 static pages generated | `.postgres-test/refund-destination-final-check.log` |
| Full real PostgreSQL suite | 404 passed / 12 files, 110.67s, exit 0 at 17:14 UTC | `.postgres-test/refund-destination-full-sql.log` |
| Full desktop/mobile browser matrix | 260 passed, 31.2m, exit 0; completed by 17:46 UTC | `.postgres-test/refund-destination-browser.log` |

Steps include storing an original payment intent, changing only the simulated destination, running refund refresh, and independently rereading payment, booking, refund ledger and notices. Expected/actual after the first repair: no false success or refund writes on a wrong destination; missing immutable attempt is rejected; a provider outage rolls back and can be retried; valid early full-refund delivery cancels without reopening and preserves the transfer ID; repeat delivery does not duplicate notices.

The first final-focused launch was blocked by the local filesystem sandbox before test execution; rerunning the same command with approved local execution produced the 151-pass result above. The isolated refund-state suite explicitly mocks the settlement verifier; actual verifier coverage is in `stripe-settlement.integration.ts`. Paid-event processing and its subsequent refund refresh are separate transactions: a failed follow-up can retain already-verified payment identity while withholding booking confirmation. Direct refund refresh failures roll back their own transaction.

## Operational Limits

Existing records without trustworthy immutable checkout history require investigation of original evidence. Do not fabricate destinations, attempts or transfers to make reconciliation succeed. Verify the real customer refund, trainer balance, transfer reversal and fee separately in Stripe; this endpoint only reads provider state and updates TRAINR's records.

The package-purchase review still confirms missing purchase/credit storage and a booking-specific money model. This patch closes a shared financial verification gap; it does not implement package checkout or decide ownership/refund/expiry policy. Actual hosted trainer onboarding, paid Stripe sandbox booking/transfer/payout, remaining security findings and other release requirements remain **HOLD**. Email setup stays deferred; main, Production and Story are unchanged.

## Publication And Cleanup

2026-10-11 17:46 UTC: independent psql read verified the disposable database marker/role and zero rows in users, bookings, payments, packages, package_items, service_offerings, sports, connect_account_attempts, checkout_attempts, payment_refunds, wallet_entries and withdrawal_requests. Evidence: `.postgres-test/refund-destination-cleanup.log`. The owned loopback application and PostgreSQL instance were stopped. No hosted data was deleted. The app's only collected server messages were expected password-reset email-unavailable notices under local fake configuration; email transport is not passed.

The previous source's 259-pass/one-connection-reset browser result remains historical evidence, not erased. This unchanged full browser suite passed all 260 cases on the refund source, including both package parent-denial cases; it does not establish the cause of that earlier reset.

## Published Source And Hosted Retest

Source `bda8fa731965281150c4838d5cee17b379771384` was committed and pushed only to `codex/payment-readiness-20261006`. No automatic deployment was initially visible, so Vercel's Create Preview Deployment action was used for the verified branch. Manual Preview [4KT5v6XSjfhgKFnyMHYHzLjcBYqR](https://vercel.com/styleres-projects/trainr/4KT5v6XSjfhgKFnyMHYHzLjcBYqR) became Ready at 17:50:04 UTC (45s). The delayed automatic deployment then arrived: [6r2fXyLE2brX3YWvCfoB6a2cmGDd](https://vercel.com/styleres-projects/trainr/6r2fXyLE2brX3YWvCfoB6a2cmGDd), Ready at 17:51:05 UTC (41s), exact same source. Its unique URL is `https://trainr-x011icvg0-styleres-projects.vercel.app`; Vercel lists the stable audit alias against that latest deployment. This was not a Production promotion or evidence that automatic deployment was permanently broken.

At 17:51:22-23 UTC, after the latest Ready state, the stable alias returned the expected 401 for anonymous GET `/api/bookings`, `/api/trainer/packages`, `/api/trainer/wallet` and POST `/api/admin/refunds`; unsigned POST `/api/payments/webhook` returned 400. Five of five passed, command exit 0; evidence `.postgres-test/refund-destination-hosted-final-source.log`. No valid financial event or authenticated write was sent. The preceding manual deployment also passed the same five probes.

The existing signed-in parent account reloaded `/parent/dashboard` with one saved Sandbox Athlete and zero bookings. Visiting `/trainer/packages` returned it to the parent dashboard rather than exposing trainer management. Captured client error log was empty. An initial attempt to find the athlete as a heading failed because it is correctly a link; the DOM confirmed the saved record. These checks are session/persistence/access smoke, not a successful hosted refund, Checkout or trainer payout. The earlier Ready wait also timed out during Vercel's build; the subsequent fresh deployment page is the Ready proof.

Fresh [GitHub check run 38161138259](https://github.com/StylereTech/trainr/actions/runs/38161138259) reports that both check and migrations jobs did not start because the account is locked due to billing. This is an external CI execution blocker, not a test assertion failure or CI pass; billing settings were untouched. Reports are published in a follow-up documentation commit. No feature or environment is marked production-ready by this report.
