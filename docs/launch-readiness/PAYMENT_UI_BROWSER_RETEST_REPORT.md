# Payment UI Browser Retest

- Date/time: 2026-10-16 10:13 UTC (03:13 America/Los_Angeles).
- Environment/source: local Windows production build at `http://127.0.0.1:3110`, source `37afc7d924d91f642d8be00cd78be3bd20f66e6f` on `codex/payment-readiness-20261006`; installed Chrome via Playwright; owned disposable PostgreSQL 16 at `127.0.0.1:55439` database `trainr_audit_timezone_20261011`, role `trainr_test`, exact marker `disposable integration database`. Main, Production and hosted Preview database were not changed in this pass.
- Accounts/data: synthetic randomly generated `browser-<UUID>@example.test` parent, trainer and admin fixtures, plus anonymous cases. Browser auth used a local-only synthetic secret matching the local app. Provider responses on the relevant E2E paths were synthetic or intercepted; no Stripe charge, transfer, payout, refund or real user credential was used.

## Steps And Results

1. Independently verified the loopback database name, role, marker, listen address and zero users/bookings/payments/package purchases. Started the already-built app on `127.0.0.1:3110` with a synthetic Stripe key and local-only authentication secret.
2. Set loopback `BASE_URL`, matching `LOCAL_E2E_SECRET`, guarded `TEST_DATABASE_URL` and `TRAINR_ALLOW_DB_TESTS=1`. Ran `npm run test:e2e -- e2e/booking-layout-local-regression.spec.ts e2e/booking-local-regression.spec.ts e2e/package-sales-local-regression.spec.ts e2e/connect-local-regression.spec.ts --workers=1`. Expected the selected mobile/desktop UI and role cases to pass. Actual: **24 passed, 10 failed before page launch** because bundled Playwright Chromium revision 1217 was absent. This was a harness failure, not an application pass.
3. Confirmed installed Chrome exists, set `LOCAL_E2E_CHANNEL=chrome`, and reran the ten previously failed booking/package files unchanged: **10/10 passed**. Reran the complete four-file selection on that channel: **34/34 passed in one run (2.7 minutes)**, with no skips or retries.
4. Independently queried users, bookings, payments, package purchases and wallet entries after the browser run: all **0**. Stopped the local app and PostgreSQL; no listener remained on ports 3110 or 55439.

| Tested surface | Expected | Actual | Result |
| --- | --- | --- | --- |
| `/book/layout-trainer` at 320, 390, 1024 and 1440 px | Selected service, athlete, date/time and payment review fit; empty service cannot imply bookability; longest name stays inside viewport | 10 layout/empty/name cases passed. Captured `test-results/booking-layout-local-regre-83059-tates-without-a-mobile-gate-chromium/booking-compact.png` and mobile counterparts in ignored local artifacts | PASS local UI |
| `/book/local-fixture`, `/api/bookings/quote`, `/api/bookings`, `/api/payments/checkout`, `/parent/dashboard` at 1440 and 390 px | Failed simulated checkout remains pending with visible error; zero-due booking confirms without Stripe; invalid discount is correctable | 6/6 selected behavior cases passed; API/provider responses in this file are intercepted | PASS simulated browser flow |
| `/api/package-purchases/checkout` across anonymous, trainer, admin and parent roles | Non-parent/invalid requests rejected before provider action | 4/4 role cases passed | PASS local role subset |
| `/trainer/dashboard`, `/trainer/profile?tab=payouts`, `/api/payments/connect` at 1440 and 390 px | Malformed/stale readiness not promoted, package history blocks account replacement, transfer capability gates ready status, payout setup error is visible | 14/14 selected Connect UI cases passed; readiness provider behavior is simulated | PASS local UI |
| Actual hosted customer Checkout, signed Stripe webhook, destination transfer and trainer bank payout | Provider receipts and persisted state after refresh | Not attempted while the synthetic trainer account remains restricted at hosted onboarding | BLOCKED / UNVERIFIED |

## Dependency Gate

The current registry-backed `npm audit --json` on this source reports **8 high, 0 critical**; `npm audit --omit=dev --json` reports **6 high, 0 critical**. `npm ls` resolves the affected `braces@3.0.3` chain through Tailwind 3, chokidar, micromatch and fast-glob; the additional full-tree entries include ESLint/Next tooling. The [GitHub-reviewed advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) lists affected `braces <=3.0.3` and no patched version as of this check. This is an unresolved security gate, not a green audit. No dependency versions, classifications or suppressions were changed; the package graph's presence is not proof of server-bundle reachability.

## Decision

The browser fixture issue is resolved by selecting installed Chrome; the corrected selected matrix is green. These tests do not prove live Stripe settlement, customer payment, trainer payout, or published automatic-refund behavior. Complete hosted Connect onboarding and user-performed sandbox Checkout, then reconcile charge, fee, transfer, webhook, database state and payout before money-flow signoff. **Production HOLD.**
