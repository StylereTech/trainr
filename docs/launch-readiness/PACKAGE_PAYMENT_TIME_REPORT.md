# Package Payment Time Evidence

## Scope And Baseline

- Started 2026-10-12, baseline `d4eedea47a68d1bedcd7d9cf4f9232f847cc92de` on `codex/payment-readiness-20261006`; initial worktree clean.
- Environment: owned disposable local PostgreSQL `trainr_audit_timezone_20261011`, guarded by `trainr_test_guard`; synthetic `@example.test` users and simulated Stripe receipts. Preview publication is recorded below when verified.
- No main/Production/Story changes, real charges, transfers, payouts, credentials, account creation or Stripe settings changes.
- Overall launch decision: **HOLD**. This fixes a prerequisite for credit redemption, not the missing redemption/purchase interface or actual hosted money-flow proof.

## Finding And Fix

Package settlement saved the latest verification time, but did not retain the payment-success event time. Treating verification or credit-issuance time as the validity start would extend a package after delayed/repeated reconciliation.

The platform webhook now handles package `payment_intent.succeeded` events. It checks signature, platform scope, package-only metadata, saved attempt/session identity, succeeded status, amount, currency, mode and current independent PaymentIntent/charge/transfer/application-fee/dispute evidence. The success event's `created` timestamp is saved in an immutable, one-per-purchase receipt only inside that verified transaction. Checkout completion or an authenticated history refresh cannot invent this timestamp. Missing local session attachment/provider evidence returns a retryable non-success HTTP response; mismatched evidence returns 409 and rolls back.

Receipt identity, uniqueness, timing bounds and immutability are also enforced in PostgreSQL. Receipt deletion is blocked independently of the retained purchase. Same-object duplicate events with identical evidence are accepted without changing the original receipt; conflicting timestamps are rejected. Later financial review preserves historical payment time and cannot enable credits. This receipt is not a refund or payout receipt.

History responses for both roles expose only `paymentSucceededAt` and `expiresAt`, never receipt/provider IDs. Version-2 expiry is payment-success time plus the immutable number of elapsed 24-hour days. Missing evidence and version-1 policy do not receive guessed expiry. The UI distinguishes Payment date, Valid until and the existing Session credits unavailable state.

Stripe documents the success webhook as the server-side fulfillment signal and event `created` as event creation time: [Payment status updates](https://docs.stripe.com/payments/payment-intents/verifying-status), [Event object](https://docs.stripe.com/api/events/object). The stored anchor is specifically the provider success-event time, not the PaymentIntent/Charge object's original creation time.

## Tests And Evidence

| Test / account / exact steps | Expected | Actual / status |
| --- | --- | --- |
| Local anonymous database guard: query database, user and marker before migration | Owned disposable target only | PASS: named database, `trainr_test`, `disposable integration database` |
| Local migration deploy | Add receipt table without rewriting existing purchase terms/records | PASS: migration `20261012140000_add_package_payment_receipts` applied |
| Focused units: validity boundaries, history routes, staging initializer | Missing/legacy dates remain unknown, role-scoped DTOs, Preview-only migration guard | PASS: 78 tests, 3 files, 11.72s |
| Focused SQL/signature suite: success before/after Checkout, identical/concurrent replay, conflict, invalid signature, wrong mode/amount/identity, future/past/missing time, provider failure/retry, direct SQL mutation/delete | Atomic and immutable verified receipt; unchanged grant count; no bookings or second payments | Initial fixture failures corrected; 207/207 passed, 190.12s. Additional SQL insertion/range cases subsequently added; final suite results below supersede this count |
| TypeScript check | All modified API/schema/history types agree | PASS |
| Migration fresh and historical rehearsal | Complete ledger/checksums, schema parity, no-op replay, preserve legacy rows | PASS: fresh, legacy, phone_history and closure_history; all 22 migrations verified; four owned rehearsal databases cleaned up |
| Full SQL suite including additional insertion/range cases | No regressions | PASS: 736 tests / 15 files, 241.55s, start 2026-10-12 13:32:09 UTC |
| Independent SQL cleanup read after suite | No synthetic records left | PASS: users/bookings/payments/purchases/receipts/grants all zero |
| Full `npm run check`, local account-free static/units/build | No regressions | PASS: 0 lint errors / 42 existing warnings; TypeScript; 1,482 units / 68 files (65.60s, start 13:40:01 UTC); production build 81 pages, compile 35.5s, build TypeScript 43s |
| Desktop/mobile browser suite | Dates, unknown legacy expiry, wrapping, errors and refresh persistence | PASS final full rerun: 24 cases, 3.5m, parent/trainer at 1440px and 390px, one worker, zero retries; `.postgres-test/receipt-browser-retest.log` |

Failures were not hidden: Windows restricted-token startup/esbuild config loading required scoped elevated local retries. The first focused SQL run passed 199 and failed 8 because the synthetic session IDs contained UUID hyphens, and the attachment-retry fixture attempted an illegal immutable-ID reset. Fixtures were corrected to use Stripe-shaped IDs and a genuinely lost create response; production guards and timeouts were not relaxed.

Local logs: `.postgres-test/receipt-focused-sql.log`, `receipt-check.log`, `receipt-migrations.log` (ignored, synthetic data only). Final result files/screenshots are noted below.

The first combined check passed lint (0 errors, 42 pre-existing warnings), TypeScript and 1,482 unit tests / 68 files (149.26s), then Prisma generation failed with Windows `EPERM` while the migration rehearsal held the query-engine DLL. No runtime/test timeout was weakened. Both SQL processes were allowed to finish before the complete check was rerun. Full SQL log: `.postgres-test/receipt-full-sql.log`.

That rerun caught TS2783 in an additional negative SQL fixture: a conditional object spread repeated `stripePaymentIntentId`. The fixture now uses explicitly typed, per-case assignments. Its seven targeted insertion tests passed (208 unrelated cases skipped by the focused filter), 5.55s at 13:38:43 UTC. `.postgres-test/receipt-check-retest.log` retains that failed typecheck; the complete final gate is recorded separately, not represented as an uninterrupted first-pass success.

Final combined gate: `.postgres-test/receipt-check-final.log`, exit 0. Existing middleware-convention deprecation warning remains; no unrelated framework migration was made.

The first browser run was **23 passed / 1 failed**, 7.0m, with zero retries. Trainer 390px lost-response completed all UI assertions, reload and database-count assertions (verified from `test.trace`), then exceeded the test/teardown limits; `sport.delete` reported an empty Prisma engine response and context shutdown also timed out. Its screenshot showed the recovered purchase with two credits and unknown payment/expiry dates, as expected without a success receipt. The trace is retained in `.postgres-test/receipt-browser-first-failure`. Independent SQL found zero users/bookings/payments/purchases/receipts and one leftover `History 170e27ce016741ffb836bf793815d57f` sport. Only that exact identified synthetic sport was removed, guarded by database/user/ownership marker and matching ID/name/slug. The exact unchanged test passed on focused rerun (11.3s test, 18.0s run). No timeout, assertion, app code or browser protection was relaxed. Full browser retest result follows below.

Viewed screenshots: [parent 390px](screenshots/package-payment-time-parent-390.png), [trainer 1440px](screenshots/package-payment-time-trainer-1440.png). Both show wrapped long names, readable payment dates and non-overlapping controls. The trainer version-1 fixture intentionally has unknown expiry. Browser payment-refresh responses and records are synthetic; they do not represent hosted Stripe charges.

The final 24-case browser rerun passed without code/configuration changes; the earlier failed case completed in 8.8s. Independent post-browser SQL read found zero users, sports, bookings, payments, purchases, receipts and grants. Owned local app and PostgreSQL services were stopped after verification. No cleanup was performed in Preview or Production.

## Hosted Provider Configuration

Read-only check on 2026-10-12 approximately 13:23-13:26 UTC using the existing signed-in Style.re sandbox session (`acct_1RAkm8PvdPuIlEw5`):

1. Open existing `/test/connect/accounts`: All 0, Enabled 0, No connected accounts. Trainer onboarding still required.
2. Open the existing platform destination `we_1UOVC2PvdPuIlEw5lmUAZkMN` and expand its subscribed events.
3. Observed Active, audit Preview `/api/payments/webhook` URL, 22 subscribed events including `payment_intent.succeeded`, `checkout.session.completed` and `checkout.session.async_payment_succeeded`.

PASS configuration presence only. No settings were changed and no event was sent. Browser loading timed out once; the same tab recovered and the subscription list was then read successfully. This does not prove delivery of a genuine package-payment event.

## Recovery And Remaining Gates

- For a missing Payment date, inspect the original platform `payment_intent.succeeded` delivery and exact saved package/attempt/intent/session identities. Retry the original signed event through the provider's supported resend flow after resolving transient attachment/provider failures. Do not create a replacement charge or manually write a timestamp.
- Refresh payment verifies current money evidence but cannot reconstruct a missing historical success event. If the original event is unavailable or conflicts, leave expiry unknown and escalate for an audited disposition. No automatic guessed backfill is implemented.
- Credits still cannot be redeemed. Build the atomic per-service redemption ledger, cross-child ownership, cancellation restoration and current-financial-hold checks, then public purchase/booking controls and end-to-end tests before enabling package sales.
- User-controlled trainer login/onboarding, actual hosted sandbox Checkout/transfer/payout proof, deferred email delivery and the other current launch gates remain open. CI billing is not fixed by a local test pass.
