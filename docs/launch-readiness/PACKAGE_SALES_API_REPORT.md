# Package Sales API Verification

## Scope

- Date: 2026-10-13 UTC. Baseline `45eb753935978cd267c2462e92790427fe17d449`, isolated audit branch `codex/payment-readiness-20261006`.
- Environment: owned local PostgreSQL `trainr_audit_timezone_20261011`, loopback 55439, disposable guard; generated `@example.test` parent/trainer/admin accounts and synthetic JWTs. Provider calls are simulated in SQL tests. No actual Stripe checkout, transfer or payout is claimed.
- Added route: POST `/api/package-purchases/checkout`. No schema, migration, dependency, hosted credential, main, Production, Story or Replit changes.
- Previous goal turn was progress: reservation implementation was tested, committed, pushed and anonymously retested. This pass advances the missing purchase path; it does not redefine the full readiness goal.

## Implementation

The API accepts either a strict reviewed purchase request (`requestId`, `packageId`, `catalogRevision`, `expectedTotalInCents`) or an owned `purchaseId` to resume. It reuses the immutable purchase and durable Stripe attempt helpers. The server calculates destination-charge amounts and fees; client input cannot choose a trainer payout account or alter provider parameters. The response contains only purchase ID and a validated HTTPS `checkout.stripe.com` URL, never raw purchase/provider records.

Current parent authorization, owned purchase access, configured Stripe secret/webhook handling and a durable five-request/minute actor rate limit precede checkout. Rate-limit persistence errors fail closed. Responses are private/no-store. Unexpected errors return a generic same-request/purchase-history recovery message without diagnostic details. Checkout creation alone is still unpaid: no booking, credit grant or wallet entry is manufactured.

Payability now blocks every SQL-non-null financial review, including false, zero, empty string and JSON null, plus recorded successful/pending/failed refunds. The locked SQL row supplies review presence because Prisma maps both SQL null and JSON null to JavaScript null. The same locked check runs before provider requests and again before releasing the returned URL. A late hold retains provider identity and attempts to expire the withheld open/unpaid session. Version-1 legacy terms cannot start a new charge because they lack the approved credit policy.

The purchase screen and package catalog link are **not implemented in this pass**. Existing public trainer pages still say package checkout unavailable. This API is a prerequisite, not a completed customer purchase journey. Current provider success/cancel URLs and package-history behavior are unchanged.

## Reproductions And Retests

1. Added six financial-activity regressions against unchanged checkout logic. **6 failed / 215 skipped**, start **09:37:33 UTC**, 6.16 seconds. Each unsafe case returned a simulated checkout URL instead of rejecting. Log: `.postgres-test/package-sales-hold-baseline.log`. The log's 02:37:33 start is local PDT; later runs explicitly use UTC.
2. First expanded SQL file after initial guards/API: **241 passed / 1 failed**, start **09:40:02 UTC**, 115.00 seconds. Failure was the newly added legacy fixture's invalid `payloadHash: legacy`, rejected by the existing database constraint before the intended assertion. Corrected fixture uses the existing valid 64-character hash; no constraint was changed. Log: `.postgres-test/package-sales-focused-sql.log`.
3. JSON-null focused reproduction after the initial JavaScript non-null fix: **1 failed / 3 passed / 239 skipped**, start **09:42:23 UTC**, 9.20 seconds. Prisma collapsed JSON null into null, and checkout still opened. Log: `.postgres-test/package-sales-json-null-baseline.log`. Replaced the predicate with locked SQL hold presence.
4. First expanded focused retest: **36 passed / 1 failed / 210 skipped**, start **09:43:33 UTC**, 17.69 seconds. The rate-limit fault injection spied on the root model delegate, but the write occurs through a transaction delegate, so no fault was injected and the route correctly returned 200. Changed the test to fail the actually executed root cleanup SQL operation. No production guard or assertion was weakened. Log: `.postgres-test/package-sales-focused-retest.log`.
5. Corrected focused retest: **37 passed / 210 skipped**, start **09:44:31 UTC**, 22.81 seconds. Covers route ownership/role/input boundaries, initial creation/replay/resume, concurrent initial requests, dropped provider response recovery, configuration and rate-limit gates, completed payment replay, legacy terms, all non-null review values, refunds and post-provider access/financial races. Log: `.postgres-test/package-sales-focused-final.log`.
6. Initial TypeScript check passed. Log: `.postgres-test/package-sales-typecheck.log`. Final full check and SQL regression results follow after execution; they are not inferred from focused success.

## Full Gates

First complete SQL run: **952/952 PASS**, 16 files, start **09:45:37 UTC**, 260.23 seconds. Log: `.postgres-test/package-sales-full-sql.log`.

First complete `npm run check`, **09:45:48-09:49:22 UTC**, stopped after units: lint 0 errors / 42 existing warnings and TypeScript passed; **1,567 units passed / 1 failed**, 72 files. The new response schema's URL refinement threw `TypeError: Invalid URL` for `/pay` instead of returning a safe validation rejection. The build stage did not run. Log: `.postgres-test/package-sales-check.log`.

The refinement now catches URL parse errors and returns false. Unchanged focused contract tests pass **14/14**, start **09:50:52 UTC**, 1.00 second. Log: `.postgres-test/package-sales-schema-retest.log`. Full gate and SQL are rerun on this correction; earlier SQL success is not relabeled as final-tree execution.

The corrected full check passed lint/TypeScript and **1,568 units / 72 files** (33.45 seconds, start **09:51:50 UTC**), then failed at Prisma generation with Windows `EPERM` renaming `query_engine-windows.dll.node`. The final SQL run was still using the client DLL; running generation concurrently was an orchestration error. Next build did not run. Log: `.postgres-test/package-sales-check-retest.log`. Wait for the existing SQL run to finish before rerunning the unchanged quality gate; do not terminate unrelated processes, delete the engine or weaken checks.

Final full SQL on corrected source: **952/952 PASS**, 16 files, start **09:51:32 UTC**, 206.83 seconds. Log: `.postgres-test/package-sales-final-sql.log`. No later application change is included in this claim. The unchanged quality gate is rerun after this process exits.

Full sequential quality gate: **PASS**, exit 0, **09:55:51-09:59:39 UTC**. Lint 0 errors / 42 existing warnings; TypeScript, **1,568 units / 72 files**, Prisma generation, optimized compilation and **83 generated pages** passed. Log: `.postgres-test/package-sales-final-check.log`. The Windows rename error did not recur once SQL processes exited. Middleware deprecation remains; no warning/timeout/assertion was suppressed. One joined lifecycle integration case was added during this gate and included in its build TypeScript phase; its SQL execution and final expanded suite are recorded separately below.

### Joined Local Lifecycle

**1/1 PASS**, 247 unrelated cases skipped, start **10:00:04 UTC**, 5.23 seconds. Log: `.postgres-test/package-sales-lifecycle.log`.

Steps: call the actual checkout route with the reviewed purchase request; receive the safe unpaid checkout response; simulate provider completion and deliver a locally signed Checkout event; verify no original payment-time receipt exists yet; deliver the locally signed PaymentIntent success event; inspect persisted receipt/grant and parent/trainer history; create two eligible synthetic siblings and trainer availability; call the actual credit reservation route for each child and replay each exact request; verify the shared balance is exhausted; cancel the first future session as the parent; independently inspect restored balance and redemption.

Expected and actual: one Stripe create invocation/simulated session, verified synthetic purchase receipt, two credits, two confirmed bookings, exact retries return the same bookings, one restored credit after cancellation, zero per-booking payments or wallet entries. **PASS**. Unlike earlier isolated credit fixtures, this test obtains its receipt/grants through the signed-event handlers. It still uses simulated provider receipts, not Stripe's sandbox network or a hosted browser purchase.

Final expanded SQL regression including the joined lifecycle: **953/953 PASS**, 16 files, start **10:00:27 UTC**, 135.34 seconds. Log: `.postgres-test/package-sales-expanded-sql.log`. This supersedes the earlier 952-case final selection without erasing its runs. Sequential full-gate unit timing was **09:56:38 UTC**, 27.65 seconds for all 1,568 tests.

## Browser And Cleanup

**68/68 PASS**, one worker, zero retries, **10:02:57-10:08:41 UTC**, 5.5 minutes. Built app on `http://127.0.0.1:3108`, local synthetic credentials, no real Stripe key. Command: `npm run test:e2e -- e2e/package-sales-local-regression.spec.ts e2e/package-history-local-regression.spec.ts e2e/checkout-recovery-local-regression.spec.ts e2e/credit-reservation-local-regression.spec.ts --workers=1 --retries=0`. Log: `.postgres-test/package-sales-browser.log`.

Scope: 24 desktop/mobile checkout recovery cases, 16 credit reservation cases, 24 package history cases, and four new built-app HTTP boundary checks. Anonymous sales POST returns 401; trainer/admin return 403; a parent request with forbidden extra fields returns 400. All four return private/no-store JSON errors. No provider call is needed for those boundary cases. Positive checkout orchestration is exercised in real SQL route tests with simulated provider responses, not claimed as a browser purchase flow.

Independent SQL readback after the browser run confirms the disposable guard and **zero users, bookings, payments, purchases, attempts, grants, receipts, redemptions and sports**. The owned local app and PostgreSQL cluster were stopped cleanly. No unknown rows were removed. No new frontend layout was introduced in this pass; the existing browser assertions were rerun without changing them.

## Remaining Gates

Customer package purchase/review/retry UI, actual signed-in hosted payment and credit reservation, Stripe success-event/webhook/destination-transfer/payout proof, trainer setup, CI execution and previously recorded release gates remain unfinished. The JSON-null ambiguity also warrants a follow-up audit of display/read projections; this pass fixes checkout release, not every historical financial-review reader. Production readiness remains **HOLD**.
