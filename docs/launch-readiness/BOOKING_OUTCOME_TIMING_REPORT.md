# Booking Outcome Timing

## Scope And Baseline

- Date: 2026-10-11 UTC, beginning approximately 09:44 UTC.
- Baseline: `22ac93565c2741e905d4b2899b4ab55c98280e33`, branch `codex/payment-readiness-20261006`; initial working tree clean.
- Environments: Windows unit tests; guarded disposable PostgreSQL 16.15 `trainr_audit_timezone_20261011`, loopback port 55439; optimized local app verified in Chrome at desktop/mobile widths. Only audit Preview project `trainr` may receive publication. Main, Production `trainr-node`, Story and email configuration are excluded.
- Accounts: synthetic parent/trainer/admin fixtures, `@example.test`; provider observations are simulated. Hosted owner-signed-in parent is preserved and is not used to bypass trainer/admin permissions.
- Routes/surfaces: PATCH `/api/bookings/[id]`, PATCH `/api/admin/bookings`, trainer dashboard, admin booking list and parent review eligibility after completion.
- P2 finding: a fully paid future session could be completed or marked no-show immediately. Completion incremented trainer session counts and enabled parent review flow before the scheduled session ended. Missing legacy timestamps did not prevent this either.

## Repair

1. Shared timing guard uses the booking's saved absolute start/end and named time zone, not today's trainer settings, browser zone or caller-supplied clock. Completion requires the saved end to have been reached; no-show requires the start. Missing/invalid/reversed timing requires support reconciliation.
2. The shared transaction helper evaluates the server clock after current actor authorization and booking/payment locks, before status, counts, notifications or audit changes. Existing payment/refund guards remain. The restriction includes zero-due sessions and administrators.
3. Exact already-committed outcome retries retain authorization checks and return without duplicating effects. No historical timestamps/statuses are invented, backfilled or rewritten.
4. Trainer and admin completion controls share the same rule. Trainer no-show control is disabled before start. A visible status explains unavailable timing; controls refresh their local clock every second and on focus. Browser timing is advisory only; a browser clock ahead of the server still receives 409 on the real mutation.
5. Recording an outcome does not submit a Stripe charge, transfer, payout or refund. This is a lower time bound on an explicit human action, not automatic attendance marking or proof that a session occurred.

## Tests And Evidence

| Steps | Expected | Actual |
| --- | --- | --- |
| New transition tests against baseline | Future/unknown-time outcomes must not commit | FAIL reproduced: 21 cases resolved instead of rejecting; 43 existing/allowed cases passed. Log `booking-outcome-baseline.log` |
| Focused timing, state-transition and HTTP adapter units | Guard both trainer/admin actions without breaking authorization/retry | PASS: 101 tests / 3 files, exit 0; two additional zero-due timing cases subsequently added for the full gate |
| Full PostgreSQL suite | Real boundaries, locks, retries and existing financial state behavior | PASS: 340 tests / 11 files, 62.71s, exit 0 |
| Four SQL actor/action cases | Reject one millisecond before boundary with no effects, allow exactly at boundary once under concurrent retry | PASS with independent Prisma readback of booking, statistics, notices, audit and unchanged payment records |
| Queued completion waits on an actual booking row lock | Clock evaluated after lock acquisition | PASS: clock advanced to the saved end while request waited; one completion committed after release |
| Full check and optimized build | Lint/types/all units/build | Initial and final gates PASS: 1,216 units / 57 files, 74 generated pages, exit 0. Final gate after browser-fixture correction compiled in 19.6s; completion confirmed 2026-10-11 10:03 UTC. Existing lint/Browserslist warnings remain |
| Desktop/mobile trainer/admin and dashboard regressions | Controls, authoritative server rejection, persistence and review eligibility | Final PASS: 24/24 in 1.7m, exit 0, no retries/skips; initial 23/24 and fixture correction documented below |
| Publication and hosted smoke | Matching source Ready on Preview; existing parent state preserved | Pending |

Commands/logs are local under `.postgres-test/`: `node node_modules/vitest/vitest.mjs run tests/booking-actions.test.ts` (baseline); focused command adds `tests/booking-action-routes.test.ts tests/booking-outcome-time.test.ts`; `npm run test:postgres` writes `booking-outcome-sql.log`; `npm run check` writes `booking-outcome-check.log`. Synthetic SQL boundary tests override `Date.now` explicitly and restore it after each test, while PostgreSQL transactions/locks/persistence are real. They do not claim real-world session attendance or provider money movement.

Two older SQL completion-success fixtures now advance the synthetic application clock to their saved session end. The existing dashboard completion/retry fixture now has explicit elapsed 2020 UTC instants, rather than completing an unknown-zone 2030 session. Its pagination, lost-response recovery, single-mutation and reload assertions remain intact. No deadline increase or assertion removal is used to make the repair pass.

Before SQL tests, the exact owned PostgreSQL directory was confirmed stopped, started with explicit loopback port 55439, and independently checked for the disposable marker and zero users/bookings/payments. No hosted database or schema migration is involved.

## Browser Retest And Cleanup

- Initial run: 23 passed / 1 failed in 2.2m, exit 1. The elapsed desktop trainer case successfully committed its real PATCH with 200, then timed out switching the same browser context to a synthetic parent by replacing its cookie while the trainer page was still refreshing. Trace showed the parent page load followed by 400 dashboard/403 athlete reads and redirect to the trainer view; these were not successful parent reads. Do not use raw mid-refresh cookie replacement as evidence of a normal sign-in flow.
- Fixed the test's account isolation: the parent readback now uses a separate browser context with its own synthetic session. The local auth fixture accepts an optional explicit context; its default remains unchanged. Original 30-second test deadlines and all application/persistence assertions remain. Scoped afterEach cleanup can finish before auth teardown if a deadline interrupts the normal finally block.
- The initial timeout also interrupted fixture teardown. Booking/service/sport cleanup completed, but two synthetic users remained. Independently inspected the disposable marker and exact IDs/emails, deleted only those two users with a database/marker guard, and verified zero users/bookings/payments before the final rerun. No broad database reset or hosted record cleanup occurred.
- Final command: `node node_modules/@playwright/test/cli.js test e2e/booking-outcome-local-regression.spec.ts e2e/dashboard-local-regression.spec.ts --project=chromium --workers=1 --reporter=list --output=test-results/booking-outcome-final`. BASE_URL `http://127.0.0.1:3107`, installed Chrome, one worker, matching local-only session secret and guarded TEST_DATABASE_URL. 16 new outcome cases and 8 existing dashboard cases, at 1440px and 390px, passed. Stripe status/balance reads alone are intercepted; booking reads/mutations, current authorization and SQL persistence are real. Paid fixture rows are synthetic, not Stripe payment receipts.
- Future and unknown-time controls were disabled; ongoing no-show was available only to the existing trainer UI; elapsed completion persisted, incremented statistics once and exposed Leave Review to the separate parent session. Advancing the browser clock four hours enabled the future button locally, but the server returned 409 and left booking, statistics, notices/audits and payment data unchanged. Reload and existing uncertain-response recovery passed.
- Screenshots inspected for wrapping/overlap: [desktop future session](evidence/booking-outcome-20261011/desktop-future-session.png) and [mobile unknown timing](evidence/booking-outcome-20261011/mobile-unknown-session.png). Browser overflow assertions passed. This is not a site-wide redesign or all-pages visual signoff.
- Final independent psql query verified the disposable marker and users=0, bookings=0, payments=0, sports=0, services=0. The owned Next session was stopped with Ctrl-C (expected exit 1) and PostgreSQL stopped cleanly. Browser verification/cleanup completed by 2026-10-11 09:59:56 UTC. Logs: `.postgres-test/booking-outcome-browser.log` and `booking-outcome-final-browser.log`; final full gate log: `booking-outcome-final-check.log`.

## Unpaid Holds And Remaining Gates

Unpaid holds were inspected first: pending reservations still participate in overlap/capacity checks with no automatic reservation expiry. This remains an implementation gap, not fixed by outcome timing. Owner choice requested for 60-minute versus 24-hour unpaid holds; no answer or cancellation policy is invented here. Stripe Checkout session expiry is independently constrained to 30 minutes through 24 hours after creation ([official API reference, verified 2026-10-11](https://docs.stripe.com/api/checkout/sessions/create?api-version=2025-03-31.basil)). Any eventual hold workflow must handle delayed Checkout creation, in-flight payment, ambiguous provider responses and late settlement before releasing inventory; a TTL alone is insufficient.

**HOLD:** actual hosted trainer onboarding, a TRAINR sandbox paid booking/destination transfer/payout, program purchase and credit redemption, unattended reconciliation and Production release safeguards remain incomplete or unverified. Historical premature outcomes need reviewed reconciliation, not blind timestamp/status/statistic rewrites. No full launch or money-flow signoff is implied.
