# Booking Price Review

## Scope And Baseline

- Date: 2026-10-11, beginning approximately 08:51 UTC.
- Baseline: `ccc64dcc84830a77a55f3832b151bc12b9cad311`, branch `codex/payment-readiness-20261006`.
- Published application source: `567c46cf70a01fb403c4aafc57892dd475dc09e5`.
- Environment: local Windows production build, synthetic accounts, guarded PostgreSQL 16.15 `trainr_audit_timezone_20261011` on loopback 55439. Hosted publication is restricted to audit Preview project `trainr`. Main, Production project `trainr-node`, Story and email setup are excluded.
- Routes: POST `/api/bookings/quote`, POST `/api/bookings`, `/book/[slug]`, `/parent/dashboard`; existing checkout recovery routes are regression scope.
- Initial FAIL: the form displayed the original service price even after a 100% coupon was entered. The server could create a zero-due reservation without showing the actual discounted amount beforehand. A concurrent service-price change could also produce a reservation at a total the parent had not reviewed.

## Fix

1. Authenticated parent-only, private/no-store price endpoint reads an eligible trainer/service, current platform minimum and coupon in one repeatable-read transaction. Previewing has no reservation, coupon-consumption, payment or provider side effects.
2. Quote and reservation use the same pure integer-cent calculation, including percentage rounding, fixed discount caps, coupon expiry/exhaustion/sport restrictions, zero-due handling and supported USD payment bounds.
3. A new reservation requires `expectedTotalInCents` to match the server's recalculated amount under the existing trainer/service/athlete/coupon locks. The client amount never sets the charge. A missing or changed amount produces `409 PRICE_CHANGED` with no booking, ledger, notification or coupon write.
4. Exact idempotent replay remains ahead of pricing checks. Previously committed requests without the new accepted-price field can recover the original booking. The field is optional in parsing solely for that legacy replay; a new request without it cannot commit. Clients with an older open form must reload/review before making a new reservation.
5. Browser quote state is keyed to the selected service and promo input. Changed inputs immediately invalidate the old total; obsolete requests are aborted and cannot replace the current result. Requests have a 15-second deadline and visible retry. Malformed, mismatched and failed responses block new submission.
6. Inline price, expanded summary and collapsed mobile summary show the confirmed total, with subtotal/discount breakdown. Zero-due confirmation explicitly says no Stripe charge or trainer payout. A price-change rejection refreshes the quote but requires another explicit submit; it does not automatically accept a different amount.

## Verification

| Steps | Expected | Actual / status |
| --- | --- | --- |
| Focused quote route, reservation and POST tests | Eligibility, roles, schema, quote calculation and atomic price guard | PASS: 106/106, exit 0 |
| Full `npm run check` | Lint, types, units and optimized build | PASS, exit 0 after final visual fixes: 1,164 units / 55 files and 74-page optimized build. Initial helper typing failure corrected; existing lint/Browserslist warnings remain |
| `npm run test:postgres` against the guarded disposable database | Real quote/reprice/replay semantics and existing money-state regressions | PASS: 335 tests / 11 files, 56.59s, exit 0; no provider calls counted as real payments |
| Real quote twice then change service $60 to $70 | Quotes do not consume coupon; old reviewed discounted amount rejected; reviewed $63 accepted | PASS with independent SQL reads: no writes on mismatch, then one reservation at 6,300 cents |
| Expire, exhaust or change coupon after quote | No silent full-price fallback or coupon use | PASS: expiry/exhaustion 400, changed discount 409; zero reservations, ledgers and uses |
| Replay legacy committed request without accepted price | Same booking returned; new legacy-shaped request rejected | PASS: new request 409; exact legacy ledger replay 201, one booking and one coupon use |
| Desktop/mobile browser, errors, timeout, stale-response race and free confirmation | Current price displayed and explicit accepted amount persisted | PASS, final 58/58 in 6.8m, exit 0, no retries/skips. Initial 48/56 run and visual fixes documented below |
| Publish and retest hosted audit Preview | Exact source Ready and retained parent state | PASS, scoped read-only smoke completed by 2026-10-11 09:28 UTC; catalog empty, no hosted booking/payment proof |

Logs: `.postgres-test/booking-price-check.log` (initial helper typing failure), `booking-price-check-final.log` (first passing full gate), `booking-price-final-check.log` (final gate), `booking-price-sql.log` (real SQL suite). Logs are local under `.postgres-test/`; no production credentials were used for these tests.

Test startup correction: `pg_ctl start` initially selected its default localhost port 5432. A restricted status check could not see the process; escalated status confirmed the same running PID. That exact owned data directory was restarted with explicit `-h 127.0.0.1 -p 55439`, then its disposable marker and zero users/bookings were verified before running tests. No second server or alternate database was created.

## Browser Findings And Retest

Initial command ran the five affected booking/price/retry/time/checkout-recovery files with Chrome, one worker, original 30-second test deadlines and no retries, using `test-results/booking-price-verified`. Result: **48 passed / 8 failed in 8.7m**, exit 1, log `.postgres-test/booking-price-browser.log`.

- Four older booking fixture cases still expected `Unable to start checkout`; the captured DOM showed the current `Checkout could not be opened` heading and the expected unpaid-booking explanation. Corrected the exact heading assertion, keeping payment state and call-count assertions.
- Four time-zone cases had an incorrect new exact-text expectation of `Total due: $0.00`. The actual paragraph correctly included `Promo applied: $60.00 off. Total due: $0.00`. Corrected that exact expectation without weakening zone/persistence checks.
- Manual [mobile screenshot inspection](evidence/booking-price-20261011/before-mobile-price-wrap.png) found real display defects despite functional passes: the selected service retained its old $60 list price after a $70 requote, and the summary broke `$70.00` across two lines. The selected service now uses the current quote subtotal, and the summary allows its title/amount columns to wrap independently while keeping the currency text on one line. Added explicit current-service-price and text-line geometry assertions, plus desktop/mobile maximum-supported-amount cases.
- All 14 initial quote journeys passed: zero-due review/commit, changed price requiring another click, exhausted coupon, server error retry, actual 15-second timeout, mismatched quote response, and delayed obsolete response. These use real local HTTP/SQL except intentionally intercepted failures; checkout is simulated. They do not validate provider money movement.

Final rerun: **58/58 PASS**, exit 0, 6.8m, completed by 2026-10-11 09:23:30 UTC. Command: `node node_modules/@playwright/test/cli.js test e2e/booking-price-local-regression.spec.ts e2e/booking-local-regression.spec.ts e2e/booking-retry-local-regression.spec.ts e2e/booking-time-local-regression.spec.ts e2e/checkout-recovery-local-regression.spec.ts --project=chromium --workers=1 --reporter=list --output=test-results/booking-price-final`. BASE_URL was `http://127.0.0.1:3107`, Chrome channel, matching local-only session secret, guarded TEST_DATABASE_URL and TRAINR_ALLOW_DB_TESTS=1. Final logs: `.postgres-test/booking-price-visual-check.log` and `.postgres-test/booking-price-final-browser.log`.

Breakdown: 16 price-review cases, 6 earlier booking cases, 8 durable reservation-retry cases, 4 parent/trainer saved-time cases and 24 checkout-recovery cases. At 1440px and 390px, synthetic parent/trainer/athlete/service/coupon records exercise real HTTP handlers and independent SQL readback. Quote failures, delayed responses and Stripe Checkout responses/navigation are intentionally intercepted only in the corresponding failure/recovery cases. No real card or bank money is moved. Existing saved bookings retain their stored price; a new quote does not reprice a saved booking.

Original test deadlines and assertion semantics are retained; timeout cases use a 20-second wait for the deliberately tested 15-second network deadline within the unchanged 30-second overall test deadline. Visual inspection and text-line geometry checks confirm currency stays on one line and the selected service updates after requoting. Evidence: [fixed mobile repricing](evidence/booking-price-20261011/after-mobile-price-review.png), [desktop zero-due review](evidence/booking-price-20261011/desktop-free-price-review.png), [maximum supported amount on mobile](evidence/booking-price-20261011/mobile-maximum-price-review.png). Synthetic unknown-sport content uses the existing media fallback; this is not a site-wide media or design signoff.

Final independent psql read verified the disposable marker and users=0, bookings=0, payments=0, coupons=0, sports=0. The local test application and owned PostgreSQL server were then stopped. Hosted parent records and sessions were not modified by the test fixtures.

## Publication And Hosted Retest

- Source `567c46cf70a01fb403c4aafc57892dd475dc09e5` pushed to the audit branch; local HEAD and remote branch matched, working tree clean before this documentation follow-up.
- Vercel Preview [d5yicNSEy9rKVc5roxUKwCT3rnuf](https://vercel.com/styleres-projects/trainr/d5yicNSEy9rKVc5roxUKwCT3rnuf) visibly Ready at 2026-10-11 09:26:03 UTC, duration 1m6s, with that exact source. Unique deployment: `https://trainr-3389tqndj-styleres-projects.vercel.app`. The [stable audit alias](https://trainr-git-codex-payment-readiness-20261006-styleres-projects.vercel.app) was visibly mapped to it. No schema change in this pass.
- Account: existing owner-signed-in Preview parent, preserved without reading or sharing login credentials. No hosted records were written during this smoke.
- Steps/results: reload `/parent/dashboard`; expected retained session and saved data, actual one saved athlete, zero open bookings/reviews, disabled pagination, PASS. Select `Past (0)`; expected empty history, actual `No past sessions yet`, PASS.
- Open `/parent/athletes/cmv3bs3xr0001jn0694fd2p2f`; expected unchanged synthetic profile, actual Sandbox Athlete, 2014-01-15, Intermediate, Basketball/Soccer checked, passing/ball-control/shooting goals and synthetic-only parent note, PASS. No Save/Delete action. A wait using an incorrect button label timed out; fresh DOM confirmed the actual `Save athlete profile` control and all saved fields. This was a selector error, not an application failure.
- Follow Browse trainers to `/browse`, click Reset search; expected removable default Texas filter and settled results, actual no active state filter, enabled Explore, `0 trainers found` and clear empty-state controls, PASS for controls/empty state. Hosted program selection, reservation, Checkout and payout are NOT passed because there is no eligible trainer to select.
- Return to `/parent/dashboard` and wait for the saved athlete link; settled readback again showed one athlete, zero bookings and `No upcoming sessions`, PASS. Final smoke completed by 2026-10-11 09:28 UTC. Documentation-only follow-up carries the same application source; final deployment identity is checked after pushing it.

## Remaining Gates

**HOLD.** A quote is not a held price or reserved slot; reservation rechecks both. These tests do not prove an actual hosted Stripe charge, Connect onboarding, destination transfer or bank payout. The last hosted catalog check had no eligible trainers, and the owner-signed-in parent had one synthetic athlete and no bookings. Programs/purchases/entitlements, hold expiry, reconciliation operations and Production rollout safeguards remain open. No Production promotion is authorized by a passing quote test.

Separate audit finding at this baseline: the older unused `/api/coupons` route was unauthenticated, returned coupon identifiers/remaining uses, and permitted validation without a service. Repository search found no UI callers. It is not used for this new confirmed-price workflow. The subsequent [legacy endpoint retirement pass](LEGACY_COUPON_RETIREMENT_REPORT.md) records the repair, exact tests and publication status; this price-review report alone does not sign off every coupon-related API.
