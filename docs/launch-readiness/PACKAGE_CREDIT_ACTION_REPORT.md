# Package Credit Booking Actions

## Scope

- Date: 2026-10-13 UTC. Baseline `7ddb4880c33b35d739b2c082ff35e288535e6ec8`, audit branch `codex/payment-readiness-20261006`.
- Environment: owned disposable PostgreSQL `trainr_audit_timezone_20261011`, loopback `127.0.0.1:55439`, role `trainr_test`, verified `disposable integration database` guard. Only synthetic `credit-*@example.test` and local browser accounts.
- Surfaces: `applyBookingAction`, package receipt/credit ledger, existing `PATCH /api/bookings/[id]` and shared admin action implementation. Customer purchase/credit booking creation is still disabled.
- No production/main/Story/Replit changes, hosted credentials, real charges, refunds, transfers or payouts. Synthetic SQL receipts are explicitly not Stripe sandbox receipts.

## Finding And Change

Code inspection found that the existing action handler required a per-booking payment and never invoked the new credit-restoration primitive. Therefore credit-funded session completion could not use the verified original package purchase, and cancellation would leave its credit consumed regardless of the approved early-parent/trainer policy. This was an unfinished integration, not a demonstrated hosted customer incident.

The handler now acquires credit locks in purchase-before-booking order and checks immutable receipt identity plus current settlement/refund/review state. It does not fabricate a second payment. Confirmed prepaid sessions can be marked completed/no-show only after their saved outcome time and only by an authorized trainer/admin. Expiry after a legitimately reserved session does not invalidate recording its historical outcome or extend its receipt validity.

Cancellation and eligible one-time restoration commit in the same transaction as notifications. Early parent and trainer cancellation return a credit; late parent cancellation/no-show consume it. A repeat request, including a later request by a different authorized participant, cannot reinterpret a committed cancellation. Restoration does not clear a package financial hold or issue a refund. Administrator credit cancellation is explicitly rejected until its adjustment policy is defined; ordinary cash-booking admin cancellation is unchanged.

## Verification

1. Initial restricted PostgreSQL launch failed with Windows token error 87. The permitted loopback-only retry succeeded. Initial focused Vitest launch could not read the parent directory/configuration; no application assertions ran. Log: `.postgres-test/credit-actions-baseline.log`.
2. First permitted focused action tests: **4/4 passed**, 87 unrelated cases skipped, 4.19 seconds, start **07:13:37 UTC**. These ran after implementation; they are not a red-before-green reproduction. Log: `.postgres-test/credit-actions-focused.log`.
3. Expanded complete credit ledger file: **113/113 passed**, 9.98 seconds, start **07:21:01 UTC**. Added 26 action cases cover real transaction persistence, early/late policy, receipt holds, authorization, time gates, expiry, concurrent cancellation, retry idempotency and notification-failure rollback. Outcome tests advance only the JavaScript outcome clock; SQL issuance/restoration retain actual database time. Log: `.postgres-test/credit-actions-ledger.log`.
4. Focused action/route/funding unit tests: **125/125 passed**, three files, 1.48 seconds, start **07:23:27 UTC**. Malformed terms, receipt/time mismatches, restored credits and dual funding fail closed. Log: `.postgres-test/credit-actions-unit.log`.
5. Initial TypeScript/route-generation check passed before adding the funding unit fixture. Full SQL regression then passed **849/849 across 16 files**, 167.34 seconds, start **07:25:26 UTC**. Independent guard and cleanup reads found zero users, bookings, payments, purchases, credit redemptions and sports. Log: `.postgres-test/credit-actions-full-sql.log`.
6. The first full `npm run check` passed lint with 0 errors / 42 pre-existing warnings, then failed TypeScript because the new isolated funding unit fixture omitted required Prisma fields. The fixture now provides complete typed booking/grant/purchase/receipt records instead of an assertion cast. Application code and SQL tests were unchanged. Log: `.postgres-test/credit-actions-check.log`. The full gate was rerun below; this failure is not hidden by the earlier successful type check.
7. Corrected full `npm run check`: **PASS, exit 0**, **07:32:09-07:36:28 UTC**. Lint 0 errors / 42 warnings; route generation and TypeScript pass; **1,526 unit tests / 70 files**, 43.46 seconds, start 07:32:46 UTC; optimized build and all 81 generated pages pass. Log: `.postgres-test/credit-actions-check-retest.log`. No application source changed after the 849-case SQL pass. No schema, migration, dependency or staging-manifest changes were made; this pass does not relabel the prior four migration rehearsals as fresh runs.

The build emitted the middleware convention deprecation and a Next.js dependency Edge Runtime warning (`process.cwd` in `next/dist/esm/server/app-render/dynamic-rendering.js`, imported through `next/server`). The latter was absent from the previous saved build log; its cause is not established or waived here. The warning did not fail this build. Hosted middleware/runtime proof and remediation remain part of the release audit.

### Authenticated HTTP And Browser Proof

The built app ran only at `http://127.0.0.1:3108`, using a loopback-only auth secret, fake Stripe keys, no email key and guarded disposable accounts. Playwright completed **26/26**, one worker, zero automatic retries, 1.9 minutes; log window **07:37:21-07:39:26 UTC**, exit 0. Log: `.postgres-test/credit-actions-browser.log`.

| Exact request/steps | Expected | Actual | Result |
| --- | --- | --- | --- |
| Parent PATCH `/api/bookings/<owned-credit-booking>` with `cancel`, >24 hours early; repeat | CANCELLED, one credit restored, two notices total, no booking payment | Matched after independent SQL reads | PASS |
| Parent same action <24 hours early; repeat | CANCELLED, credit remains consumed, no cash refund | Matched | PASS |
| Trainer same action <24 hours early; repeat | CANCELLED, one credit restored | Matched | PASS |
| Admin credit cancellation | 409, no status/credit/notification mutation | Matched | PASS; adjustment policy still unavailable |
| Different parent's cancellation | 403, no mutation | Matched | PASS |
| Trainer completion before session end | 409, no mutation | Matched | PASS |

Successful credit cancellation returns `checkoutClosure: not_required`. All six cases verify no booking payment/wallet entry and no nested credit record, package receipt or synthetic PaymentIntent ID in the response. They authenticate via the local-only fixture; they do not test real email/login or public credit reservation creation.

The other 20 cases exercise existing cash-booking controls at 1440px/390px for TRAINER and ADMIN: future/ongoing/elapsed/unknown-time/revoked-parent states, server rejection after a deliberately changed browser clock, persisted completion/no-show, unchanged payment data and parent refresh/review link. Provider status endpoints are intercepted; this is not actual Connect readiness. [Reviewed mobile cash controls](screenshots/credit-actions-cash-controls-390.png) have readable wrapped labels and no visible overlap; document-overflow assertions passed. This screenshot is not credit dashboard proof.

Final independent guard/cleanup queries found users, bookings, payments, purchases, grants, receipts, redemptions and sports all zero. The owned Next server and PostgreSQL server were stopped. No test process remains running.

## Remaining Gates

This integrates actions for a persisted credit-funded booking; it does not yet create one through the customer booking API. Public package sales, atomic reservation/redemption, role-safe funding/balance DTOs and dashboard labels/controls, service-replacement handling and the pending expiry interpretation remain incomplete. The existing dashboard can still mislabel a seeded credit-funded booking as missing payment; do not activate public credit booking until its read/UI path is integrated.

Actual signed-in hosted checkout, Stripe webhook delivery, Connect onboarding, transfer/payout proof, dependency remediation and GitHub CI recovery remain open. The earlier browser approval-service interruption is not bypassed. Overall production decision remains **HOLD**.

## Final Gates And Publication

All scoped local regression gates above passed. Source `fb809943509c52e345f5804bd26f261b85f1f807` (`feat: integrate package credit booking actions`) was committed and pushed to the audit branch. Application and local test results above refer to that source; the later publication-note commit changes documentation only.

GitHub commit status first reported the [Vercel audit deployment DBEMWZZENCtWXHs948AwZPLCBdon](https://vercel.com/styleres-projects/trainr/DBEMWZZENCtWXHs948AwZPLCBdon) pending, then success at approximately **07:44 UTC**. One intervening metadata read failed with a connector transport error; a delayed retry of the same source recovered. No deployment was restarted. This is commit-status metadata, not independent alias/source mapping or hosted migration-log inspection.

[GitHub Actions run 38364290857](https://github.com/StylereTech/trainr/actions/runs/38364290857) has `check` and `migrations` marked failed, started 07:41:38 UTC and completed 07:41:40 UTC, with **zero executed steps** in the fresh jobs response. Preview Comments succeeded. The prior billing-lock evidence does not freshly establish this run's precise failure cause. GitHub CI remains unresolved, not green.

Post-push anonymous smoke used only the stable audit Preview, no cookies/credentials, at **07:44:22-07:44:25 UTC**. All **10/10 passed** with JSON contracts: health 200 (`ok`/`dbConnected` true); trainer catalog 200 (integer total **0**); bookings, trainer packages, trainer wallet and package history GETs 401; empty checkout POST 401; unsigned webhook POST 400; PATCH `/api/bookings/audit-anonymous-probe` and `/api/admin/bookings` each 401. These checks submit no authenticated booking action or provider transaction. Evidence: `.postgres-test/credit-actions-hosted-smoke.json`.

Every smoke record explicitly marks `aliasSourceIndependentlyVerified: false`. The requested source SHA is not a SHA returned by these endpoints. No blocked signed-in navigation or Vercel log retrieval was performed by another route. Hosted authenticated credit actions, actual Stripe Checkout, Connect and payouts remain unverified. Overall **HOLD**.
