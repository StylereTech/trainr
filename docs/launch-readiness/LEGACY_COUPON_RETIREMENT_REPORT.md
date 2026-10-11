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
| Publish exact source to isolated Preview and check existing session | Vercel Ready at matching source, parent state retained | Pending |

Commands: `node node_modules/vitest/vitest.mjs run tests/coupon-retirement.test.ts` (baseline); same command with `tests/booking-quote.test.ts tests/booking-creation.test.ts tests/booking-post.test.ts` added (focused retest); `npm run check` (full gate). Logs are local `.postgres-test/coupon-retirement-baseline.log`, `coupon-retirement-focused.log`, `coupon-retirement-check.log` and `coupon-retirement-final-check.log`.

The first sandboxed Vitest invocation could not read its configuration because of filesystem restrictions; the same local test command ran with approved escalation. No failure was hidden with skips/retries or relaxed assertions. The final full check removes the newly introduced unused request argument rather than suppressing lint. Existing unrelated lint/Browserslist warnings remain.

Final HTTP command: `BASE_URL=http://127.0.0.1:3107 node node_modules/@playwright/test/cli.js test e2e/coupon-retirement-local-regression.spec.ts --project=chromium --workers=1 --reporter=list --output=test-results/coupon-retirement-local` (BASE_URL set using PowerShell syntax on Windows). Log: `.postgres-test/coupon-retirement-http.log`. These are actual HTTP handler tests through the optimized Next server, not screenshots or full browser journeys. No route/network mocks were installed. The loopback database URL and Stripe key were local-only placeholders; no database server was started, no real credentials were used and no session cookies were supplied. Tests completed by 2026-10-11 09:39:13 UTC. The owned Next session was stopped afterward using Ctrl-C (expected exit 1); no required local process remains running.

## Remaining Gates

**HOLD.** This is a limited API information-disclosure/duplicate-contract repair, not an entire security audit. Real hosted trainer onboarding, an actual TRAINR sandbox paid booking/destination transfer/payout, program purchase and credit redemption, hold expiry, reconciliation operations and Production release safeguards remain unverified or incomplete. The previous hosted catalog was empty. No schema change, migration, historical data repair or real money movement occurs in this pass. Previous SQL/browser results are historical evidence, not newly rerun claims for this pass.
