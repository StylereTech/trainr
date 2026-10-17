# Legacy Coupon Endpoint Retirement

## Scope And Baseline

- Date: 2026-10-11 UTC, beginning approximately 09:31 UTC.
- Baseline: `f19bfc48d349f476896b98f9c160bd44830ae648`, branch `codex/payment-readiness-20261006`. Fresh fetch confirmed remote matched local HEAD; initial working tree clean.
- Environment/account: local Windows, synthetic unit fixtures and anonymous loopback HTTP requests. Audit Preview publication only; main, Production project `trainr-node`, Story and deferred email setup are excluded.
- Routes: POST `/api/coupons`, unsupported methods on that path, and unauthenticated POST `/api/bookings/quote`. Existing quote/reservation units cover parent-only access, service eligibility and coupon calculation.
- Source finding (P2): the old coupon handler has no authentication, accepts a missing service, queries coupon data, and returns identifiers, remaining uses and expiry. Sport restrictions can be skipped without a service. Malformed JSON and persistence errors log raw exceptions. Repository-wide caller search found no active consumer; the booking form uses `/api/bookings/quote`.

## Fix And Compatibility

POST `/api/coupons` now returns a constant `410 COUPON_ENDPOINT_RETIRED`, private/no-store response. It neither accepts/reads the request body nor imports authentication, Prisma or Stripe, and therefore cannot disclose whether any submitted code exists. It performs no database reads/writes or provider requests. Other methods remain unsupported by the Next route.

The response names `/api/bookings/quote` as the replacement; this is not an automatic redirect. Callers must authenticate as a parent and explicitly supply a service and optional `couponCode`, review the returned integer-cent amount, then submit that reviewed amount when reserving. Unknown external clients using the retired, undocumented `code` contract must migrate; no caller compatibility is claimed merely because repository search is empty. Admin coupon management, stored coupons, existing bookings/payments and the current booking UI are unchanged. This removes duplicate validation rather than adding a second pricing authority.

## Evidence And Retest

| Exact steps | Expected | Actual |
| --- | --- | --- |
| Run new retirement contract tests against the baseline handler | Expose failure of the required no-lookup/constant-response contract | 7/7 failed as expected: legacy responses were 200 or 500 rather than 410. The initial unknown-code fixture returned the same synthetic coupon as other inputs; corrected it to return null before final verification |
| Run retirement, quote, reservation and booking POST units after repair | No body read, no database call/logging; existing quote and booking contracts retained | PASS: 113/113 across four files, exit 0 |
| Full check after final lint cleanup | Lint, types, all units, optimized build | PASS, exit 0: 1,171 units / 56 files and 74 generated pages; final build compiled in 22.2s. New unused-argument warning removed; unrelated existing warnings remain |
| Compiled local HTTP requests, with no database server started | 410 for valid-shaped, unknown, malformed, empty and oversized input; 405 for unsupported methods; replacement denies anonymous requests with 401 | PASS: 12/12 in 2.9s, exit 0, no retries/skips; exact JSON and no-store headers verified |
| Publish exact source to isolated Preview and check existing session | Vercel Ready at matching source, parent state retained | PASS: source `849059b4f75fd22ae0eb4f3ffdd6ae39115304a0`, Ready at 09:41:03 UTC; parent refresh and history retained |
| Anonymous hosted API probes with synthetic identifiers | Retired POST 410; GET 405; replacement quote 401 before parsing | PASS: five requests; exact retirement JSON on first probe and status/private-no-store checks on subsequent POST probes |

Commands: `node node_modules/vitest/vitest.mjs run tests/coupon-retirement.test.ts` (baseline); same command with `tests/booking-quote.test.ts tests/booking-creation.test.ts tests/booking-post.test.ts` added (focused retest); `npm run check` (full gate). Logs are local `.postgres-test/coupon-retirement-baseline.log`, `coupon-retirement-focused.log`, `coupon-retirement-check.log` and `coupon-retirement-final-check.log`.

The first sandboxed Vitest invocation could not read its configuration because of filesystem restrictions; the same local test command ran with approved escalation. No failure was hidden with skips/retries or relaxed assertions. The final full check removes the newly introduced unused request argument rather than suppressing lint. Existing unrelated lint/Browserslist warnings remain.

Final HTTP command: `BASE_URL=http://127.0.0.1:3107 node node_modules/@playwright/test/cli.js test e2e/coupon-retirement-local-regression.spec.ts --project=chromium --workers=1 --reporter=list --output=test-results/coupon-retirement-local` (BASE_URL set using PowerShell syntax on Windows). Log: `.postgres-test/coupon-retirement-http.log`. These are actual HTTP handler tests through the optimized Next server, not screenshots or full browser journeys. No route/network mocks were installed. The loopback database URL and Stripe key were local-only placeholders; no database server was started, no real credentials were used and no session cookies were supplied. Tests completed by 2026-10-11 09:39:13 UTC. The owned Next session was stopped afterward using Ctrl-C (expected exit 1); no required local process remains running.

## Publication And Hosted Retest

- Application commit: `849059b4f75fd22ae0eb4f3ffdd6ae39115304a0`, `fix: retire unauthenticated legacy coupon lookup`, pushed to the existing audit branch. Local HEAD matched the remote tracking ref. Main/Production were not changed.
- Vercel deployment [FSv4cwkFwCUWpYHyRvktuUDmgXX8](https://vercel.com/styleres-projects/trainr/FSv4cwkFwCUWpYHyRvktuUDmgXX8) visibly **Ready**, Preview environment, exact source above, completed 2026-10-11 09:41:03 UTC in 1m3s. Unique URL: `https://trainr-p5qiv3uj4-styleres-projects.vercel.app`. The stable audit alias `https://trainr-git-codex-payment-readiness-20261006-styleres-projects.vercel.app` was visibly mapped to this deployment. A transient browser navigation timeout recovered by reading the same tab, without restarting or changing deployment state.
- Existing owner-signed-in Preview parent: reloaded `/parent/dashboard`, waited for the saved athlete link, observed one synthetic athlete, zero open bookings/reviews, `No upcoming sessions`, and disabled pagination. Selected `Past (0)` and observed `No past sessions yet`. PASS for this scoped read-only session smoke; no athlete/profile/booking records were written and no credentials were read or copied.
- Anonymous service probes (PowerShell `Invoke-WebRequest`, no cookies, no authorization header) on the stable alias: POST `/api/coupons` with `{"code":"TRAINR_SYNTHETIC_AUDIT_UNKNOWN"}` returned 410 and the exact constant retirement JSON. Malformed JSON POST returned 410; GET with a synthetic code query returned 405. POST `/api/bookings/quote` with synthetic missing service/coupon input returned 401; malformed JSON returned 401 before parsing. All POST responses had `Cache-Control: no-store, private` and no coupon metadata. No real coupon/account/financial data was sent. These are actual deployed HTTP results, not browser-intercepted responses.
- Subsequent four probe results are stored locally in `.postgres-test/coupon-retirement-hosted-http.json`; assertions exited 0. Hosted checks completed by 2026-10-11 09:41:42 UTC. Initial probe result: `410`, `application/json`, `COUPON_ENDPOINT_RETIRED`, replacement `/api/bookings/quote`.
- This documentation-only follow-up carries the same application source. Its final deployment/source mapping and parent refresh are checked after push; no new application change or money-flow claim is implied.

## Remaining Gates

**HOLD.** This is a limited API information-disclosure/duplicate-contract repair, not an entire security audit. Real hosted trainer onboarding, an actual TRAINR sandbox paid booking/destination transfer/payout, program purchase and credit redemption, hold expiry, reconciliation operations and Production release safeguards remain unverified or incomplete. The previous hosted catalog was empty. No schema change, migration, historical data repair or real money movement occurs in this pass. Previous SQL/browser results are historical evidence, not newly rerun claims for this pass.
