# Trainer Payout Screen Verification

- Date/time: 2026-10-11 06:00 UTC onward.
- Baseline commit: `3dc8874f4446d2071f9bbe5e50ed59274d2411c1`; changes are in the commit containing this report.
- Environment: isolated audit checkout, local optimized Next.js app, guarded disposable PostgreSQL `trainr_audit_20261008` on `127.0.0.1:55439`. No Production or Story changes.
- Accounts: generated `browser-<UUID>@example.test` trainers, automatically removed by the local fixture. Existing owner-signed-in Preview parent remains intact; saved synthetic athlete was observed again during this pass.
- Routes/endpoints: `/trainer/profile?tab=payouts`, `/trainer/dashboard`, `/api/trainer/wallet`, `/api/payments/connect`, legacy `/api/trainer/stripe-connect`, authenticated `/api/trainer/onboarding`.
- Overall money-flow status: **HOLD**. Local mocked balances are not evidence of real Stripe money movement.

## Findings And Fix

Source inspection found that the profile payout panel accepted unchecked wallet/history data, ignored Connect status errors, and retained the old payout schedule after a failed wallet refresh. It lacked a normal refresh control. A malformed payout currency or non-array history could crash rendering. These are source-confirmed defects; a pre-fix hosted trainer reproduction was not available because the current Preview account is a parent.

The payout panel now mounts a dedicated component only when opened. It uses the existing bounded, abortable, latest-request-only data hook and the canonical Connect response contract. Failed/malformed reads clear the previous data. Verified provider status controls the setup action, with visible unverified/retry states. Wallet, schedule and payout rows are validated before rendering; negative Stripe balances remain supported. Non-USD payout amounts are explicitly labeled as minor units rather than assuming every currency uses two decimals. The current US/USD path retains currency formatting. Unsafe Stripe redirect URLs are rejected.

## Exact Verification Steps

1. Confirm clean baseline checkout and stopped local PostgreSQL server. Start the existing local cluster on loopback only. Independent SQL returned one guard row with `disposable integration database` and zero users before fixtures.
2. Run `npm test -- tests/payout-contract.test.ts tests/connect-contract.test.ts`: **PASS, 24/24**. Contracts reject malformed history, schedule, amounts, currency and timestamps; accept actual unlinked response and negative balance.
3. Run `npm run check`: **PASS, exit 0**. Lint passed with existing warnings, TypeScript passed, **1,007/1,007 unit tests in 50 files passed**, optimized build generated all 73 pages. Existing Browserslist freshness and lint warnings remain; they were not silently reported as warning-free.
4. Run `npm run test:postgres` with explicit guarded test database settings: **PASS, 317/317 tests in 11 files, 182.33 seconds**. Stripe provider calls are mocked in this suite. Expected SQL constraint errors exercised rollback; the suite exited zero. Independent subsequent SQL counted zero users, bookings and payments.
5. Start rebuilt app on `http://127.0.0.1:3107` with local-only auth secret and synthetic Stripe configuration. Set matching `LOCAL_E2E_SECRET`, `BASE_URL`, `LOCAL_E2E_CHANNEL=chrome`, guarded `TEST_DATABASE_URL` and `TRAINR_ALLOW_DB_TESTS=1`. Run `npx playwright test e2e/payouts-local-regression.spec.ts e2e/connect-local-regression.spec.ts --project=chromium --workers=1 --reporter=list`: **PASS, 12/12 in 2.9 minutes, exit 0** at 1440px and 390px. No skipped cases.

Expected browser results: ready balances and schedule visible; HTTP 503, malformed history or malformed currency clear them and expose retry; retry restores data; empty history is explicit; failed/malformed/provider-error Connect responses never show Payments ready and disable launch; valid current status restores launch; unsafe redirect stays on TRAINR; actual unlinked local endpoints show no connected balance and Start Stripe setup. Check screenshots and horizontal overflow at both widths.

Actual browser results: every expectation above passed. Both hung-request cases displayed errors after the existing 15-second timeout and recovered through explicit retries. Screenshot inspection of the desktop ready panel and mobile ready/unverified panels found no overlapping text or clipped controls; automated document-width checks passed. Local screenshots: ignored `test-results/payouts-local-regression-p-*/payouts-verified.png` and `payouts-unverified.png`. Linked balances/readiness are simulated; the unlinked endpoint cases use actual authenticated local handlers and PostgreSQL. Independent SQL after browser cleanup again counted zero users, bookings and payments.

## Publication And Remaining Gates

Source fix `0053b01fec6d5a689bd65bd7506a91bb03cc357a` was committed and pushed to `codex/payment-readiness-20261006`; local HEAD and remote tracking SHA matched and checkout was clean. Vercel Preview `63n1GLrRWMQrKFU6FJdsQPbkQ1vN` is **Ready**, build duration 1m 3s, completed 2026-10-11 06:20:14 UTC. Exact commit, Preview environment and stable audit alias were observed in the deployment detail UI. Unique deployment: `https://trainr-4ch7qcv7w-styleres-projects.vercel.app`.

Hosted retest, approximately 06:21 UTC, existing owner parent account, no mocks:

1. Navigate the stable alias to `/trainer/profile?tab=payouts`. Expected role denial; actual redirect to `/parent/dashboard`, with one saved athlete and zero open bookings: **PASS**.
2. Open saved synthetic athlete `cmv3bs3xr0001jn0694fd2p2f`. Expected saved values; actual Sandbox Athlete, 2014-01-15, Intermediate, Basketball/Soccer and previous synthetic goals/notes retained: **PASS**.
3. Try direct browser navigation to `/api/trainer/wallet`. Actual `net::ERR_BLOCKED_BY_CLIENT`: **BLOCKED / NOT VERIFIED**, no HTTP status inference and no bypass attempt. Return to the parent dashboard succeeded.

The trainer payout panel itself was exercised on the local optimized build, not with an authenticated hosted trainer. Local server and disposable PostgreSQL were stopped after cleanup. No production promotion is authorized by this report. Trainer Preview signup/onboarding, an approved bookable service, actual sandbox Checkout/settlement/transfer/payout and full package purchasing remain unverified or incomplete. Resend setup remains owner-deferred; no verification bypass was introduced. Package ownership rules await the owner response; no entitlement/refund policy was invented.
