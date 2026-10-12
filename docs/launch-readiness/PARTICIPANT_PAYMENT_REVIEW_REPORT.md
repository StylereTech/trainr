# Participant Payment Review Report

## Scope And Baseline

- Date: 2026-10-12 UTC (local workstation 2026-10-11 PDT).
- Baseline commit: `a64fb62516788faf632cef2bcb2a5ca0dd9972c6` on `codex/payment-readiness-20261006`.
- Environments: guarded disposable PostgreSQL `trainr_audit_timezone_20261011` at loopback port 55439; isolated TRAINR audit Preview only after publication.
- Accounts: generated `example.test` parent, trainer and administrator fixtures. Hosted browser remains the existing PARENT session; no trainer success is inferred.
- Routes: signed local `POST /api/payments/webhook`; `PATCH /api/bookings/[id]` and `PATCH /api/admin/bookings` through their shared `applyBookingAction` service; `/trainer/dashboard` and `/admin/bookings` in local browser regression.
- No production database, main branch, Story, credentials or real-money operation is in scope. Stripe receipt responses in SQL tests are simulated; webhook signatures and SQL transactions are real.

## Reproduction

Created a pending $60 booking with an immutable checkout attempt and a valid simulated destination receipt. Before delivering a signed paid event, deactivated the parent, trainer or both, or changed either participant's role. Expected: retain the received payment identity but leave booking pending for review; do not send a booking confirmation or new notices to deleted accounts.

All five baseline cases failed: the old handler changed the booking to `CONFIRMED`. Log `.postgres-test/participant-review-baseline.log`, 2026-10-12 06:01:52 UTC, exit 1, five failed / 108 skipped. This is a reproduced application defect, not a provider failure.

## Fix

Settlement now locks current participant accounts and active review recipients in deterministic user-ID order before booking/payment locks, retains authority through provider verification and commit, and checks that ownership did not change between preliminary lookup and locked re-read. A closed or wrong-role participant prevents new confirmation while preserving verified receipt identifiers and payment accounting. Eligible active parties/operators receive an explicit reconciliation notice, not a refund or bank-payout claim. Review replay deduplicates against any saved recipient because the parent may be closed. A later account revocation does not silently rewrite an earlier confirmed booking.

Manual confirm/complete/no-show also require current active PARENT and TRAINER participants. Support cancellation remains possible, preserving payment state and notifying only eligible active recipients. Sorted account locks precede booking/payment locks here too. Existing idempotent completed actions remain no-ops after actor authorization.

An intermediate implementation locked accounts after provider reads while holding booking locks. Although its 117 focused SQL cases passed, code inspection identified an incompatible lock order with booking actions/account writers. It was replaced before publication, not accepted on the strength of that passing run.

## Verification

| Steps | Expected | Actual |
| --- | --- | --- |
| Deliver and replay paid events after five participant revocation combinations | SUCCEEDED receipt, PENDING booking, review-only eligible notices, no wallet entry | PASS, real SQL / simulated Stripe |
| Attempt admin manual confirmation of those held bookings | 409, booking remains PENDING | PASS, full SQL retest |
| Hold account revocation in another SQL transaction, start settlement, observe `pg_blocking_pids`, commit revocation | Settlement waits, then withholds confirmation; revoked admin refresh rolls back before provider read | PASS, focused SQL |
| Pause provider verification and attempt parent/trainer/admin revocation independently | Writer waits on row lock until settlement commits | PASS, focused SQL |
| Replay success after an already confirmed booking's trainer closes | Preserve prior booking history, notify eligible reviewers once, no new deleted-trainer notice | PASS, focused SQL |
| Change parent/trainer role or deletion state, then attempt confirm/complete/no-show as admin | 409, no state/statistics/notification/audit mutation | PASS, focused unit |
| Cancel as support with both participants closed | CANCELLED, unchanged financial accounting, operator-only review notice | PASS, focused unit |

- Focused settlement SQL: **120 passed**, 12.24 seconds, 2026-10-12 06:07:17 UTC; `.postgres-test/participant-review-locks-focused.log`.
- Focused unit suites: **107 passed**, 2.98 seconds, 2026-10-12 06:08:17 UTC; `.postgres-test/participant-review-unit-focused.log`.
- Full SQL: **613 passed in 14 files**, 159.38 seconds, start 2026-10-12 06:08:30 UTC, exit 0; `.postgres-test/participant-review-sql-full.log`. Independent SQL guard inspection confirmed zero users, bookings, payments, package purchases and wallet entries afterward. The unprivileged stop was denied by Windows; the exact owned database was then stopped successfully with elevation.
- First full check: lint zero errors / 43 existing warnings and TypeScript passed, then units finished **1,375 passed / 5 failed**, 33.79 seconds (06:14:42 UTC), exit 1 before build; `.postgres-test/participant-review-check.log`. Two older mock suites returned no active accounts, and two amount-mismatch fixtures omitted owner relations required by the new preliminary read. Updated those mocks/fixtures without weakening assertions or production checks. Fresh focused retest: **103 passed**, 1.51 seconds (06:15:33 UTC), `.postgres-test/participant-review-unit-retest.log`. A fresh full check is required; the failed run is not a pass.
- Fresh full `npm run check`: **PASS**, exit 0; lint zero errors / 43 existing warnings, TypeScript, **1,380 unit tests / 63 files**, optimized build and 79 static-generation entries. Unit start 06:16:29 UTC, 28.77 seconds; `.postgres-test/participant-review-check-retest.log`. Existing middleware convention warning remains.
- Compiled affected desktop/mobile regression: **52 passed**, 8.9 minutes, exit 0; `.postgres-test/participant-review-browser.log`. This is the affected suite, not every historical E2E file. Publication evidence follows when verified.
- No schema or migration changes.

## Browser Evidence

Compiled localhost app on port 3108, guarded disposable SQL database, synthetic JWT-authenticated parent/trainer/admin accounts, Chrome at 1440px and 390px. Provider observations are intercepted only where existing browser fixtures require them; booking action APIs, authorization and SQL writes are real. New cases render an elapsed confirmed session, change the parent's role in SQL while the trainer/admin page remains open, click Complete and require the account-review alert, unchanged CONFIRMED status, zero completion statistics/notices/admin actions, and unchanged payment accounting.

All 52 affected cases passed: 20 booking outcomes (including four new revocation cases), 24 checkout recovery and eight dashboard cases. Screenshots were visually inspected: alert text and recovery controls wrap without overlapping the booking, and failed outcome controls remain disabled until reload. Preserved [trainer desktop](evidence/participant-review/trainer-desktop.png) and [trainer mobile](evidence/participant-review/trainer-mobile.png) contain synthetic data only.

After the run, independent SQL guard/count inspection confirmed zero users, bookings, payments, package purchases, wallet entries, sports and notifications. Owned app and PostgreSQL processes were stopped after test completion. No production or shared hosted data was deleted.

## Remaining Gates

This fix does not expire already-issued Stripe Checkout URLs on account closure, execute a refund, cancel existing bookings automatically, or solve package-credit issuance/redemption. Booking financial-review state still lives in notifications rather than a durable Payment review flag: manual actions can potentially bypass a dispute/reversal review when both accounts remain eligible. That separately identified code-level gate needs implementation and regression proof; this report does not claim it resolved. Refund-notification behavior after account closure also needs separate coverage.

Actual hosted trainer login, Connect onboarding, customer sandbox checkout, webhook receipt, trainer transfer and payout remain unverified. Shared-family credits/public purchasing and policy decisions remain incomplete. Email is deferred by the owner. GitHub billing and dependency-security findings remain open. Overall production/money-flow signoff: **HOLD**.
