# Credit Review Presence Audit

Latest local result, **2026-10-13 12:54:56 UTC**: final optimized build passed the full quality gate (**1,604 units**), **994 SQL cases**, all four migration rehearsals, and **56 selected browser/API cases** with zero retries. Publication status is recorded below when verified. Overall production/money-flow signoff remains **HOLD**.

## Baseline And Hosted Prerequisites

- Date: 2026-10-13 UTC. Source baseline `0a6feb59a254e19025214f1dc330260a49d4a804`; clean audit branch at entry. Previous goal turn was progress: verified purchase screens were committed, pushed, deployed and anonymously retested.
- Scope: owned TRAINR audit Preview and disposable local database only. Main, Production, Story, Replit, real funds and credential changes remain excluded.
- Browser access resumed through the normal in-app browser path. Fresh reload of the existing parent session at `/parent/packages` showed zero purchases; `/parent/dashboard` showed one saved Sandbox Athlete and zero bookings. The unfiltered `/browse` page showed no trainers. This supersedes the previous browser-access blocker, not the missing trainer/provider proof.
- Existing Stripe sandbox `acct_1RAkm8PvdPuIlEw5` showed the active TRAINR audit platform webhook at the correct Preview `/api/payments/webhook`, listening to 22 event types including `payment_intent.succeeded`. Its displayed historical overview had two deliveries and zero failures; those counters are not a new payment/webhook test. Connected accounts showed All 0 / Enabled 0 / No connected accounts.
- Trainer signup while signed in correctly redirected to the parent dashboard. After signing out (without editing/deleting that account), `/auth/signup?role=trainer` displayed the trainer form. A handoff requests that the owner enter a separate trainer email/password and review/submit terms. No credential was entered or agreement accepted by the agent. The signup tab remains available; trainer onboarding/Stripe payment tests remain pending this prerequisite.
- Later in the same pass, opening the existing Vercel deployment tab timed out and reset browser control; the normal rebind reported `Browser is not available: 1`. No authenticated UI continuation, hosted migration-log inspection or alias/source verification is claimed after that interruption. Earlier fresh observations remain timestamped evidence, not a claim of uninterrupted browser access.

## Financial Hold Finding

Current checkout/history interpret any SQL-non-null `financialReview` value as a hold. Older credit SQL functions explicitly exempt JSON null; Prisma also maps SQL null and JSON null to the same JavaScript null. The credit options and outcome readers therefore cannot distinguish them by `!== null` alone. This is a high-severity credit financial-hold bypass. Any earlier implication that SQL already protected JSON-null credit debits is superseded by these actual failing reproductions.

### Reproduction And Focused Retest

- Environment/account: owned localhost PostgreSQL `trainr_audit_timezone_20261011`, port 55439, owner `trainr_test`; UUID-scoped synthetic parent/trainer/child fixtures, not hosted accounts or actual Stripe receipts.
- Command: `npm run test:postgres -- tests/integration/package-credit-ledger.integration.ts -t 'JSON-null review'`, with `TZ=UTC`, guarded `TEST_DATABASE_URL` and `TRAINR_ALLOW_DB_TESTS=1`.
- Steps: create a synthetic settled purchase and receipt; set its review field to `Prisma.JsonNull`; query options, POST a credit reservation, insert grants/redemptions directly, and attempt trainer completion/no-show after session time.
- Expected: zero spendable credits, HTTP/action 409, SQL insert rejection, no session outcome or new debit.
- Baseline 2026-10-13 11:25:45 UTC: **6 failed**, 184 excluded by focused filter, 46.93 seconds. Actual options exposed 2 credits, HTTP returned 201, SQL inserts succeeded and session outcomes changed. Local log: `.postgres-test/credit-review-presence-baseline.log`.
- Retest 2026-10-13 11:32:32 UTC after source fix and additive migration: **6 passed**, 184 excluded by focused filter, 5.80 seconds. Local log: `.postgres-test/credit-review-presence-focused.log`. No retries or timeout increases.

### Fix

- Resolve review presence using Prisma `not: DbNull`, not JSON truthiness. Dashboard/list reads use one repeatable-read snapshot; mutations and saved-request recovery read under existing purchase locks.
- Credit options, reservation/replay, grant creation and trainer/admin outcomes use the same presence result. DTOs expose a generic hold, not private review/provider detail.
- Add `20261013113000_preserve_credit_review_holds`: two insert-only SQL triggers reject every SQL-non-null review under a purchase row lock. They do not rewrite old migrations, delete history or block cancellation restoration. Trigger names sort after the existing guards, preserving lock order; PostgreSQL executes same-kind triggers alphabetically ([official documentation](https://www.postgresql.org/docs/current/sql-createtrigger.html)).
- The Preview upgrade allowlist includes this migration, retaining exact audit branch/database ownership and sandbox-key guards. Local migration deploy succeeded. Hosted application is pending verification/publication.
- Added broader tests for same-request recovery, held cancellation, SQL-null control, falsy/JSON-null grant suppression and desktop/mobile parent/trainer/admin funding displays. Full-suite results are pending; they are not claimed passed here.

## Extended Verification

- Full disposable SQL suite: **994/994 passed**, 16 files, start **2026-10-13 11:34:08 UTC**, duration **260.36 seconds**. Log: `.postgres-test/credit-review-presence-full-sql.log`. Includes clean SQL-null control, all five held JSON forms during application grant creation, same-request replay, retained review after cancellation and existing financial/ownership/concurrency regressions.
- Type checking passed. Focused credit-funding unit suite: **38/38 passed**, start **11:39:18 UTC**, 2.04 seconds. An initial sandboxed attempt failed before loading tests because esbuild could not read its configuration; the scoped-permission retest passed. Both `.postgres-test/credit-review-presence-focused-unit.log` and `-focused-unit-retest.log` are retained locally.
- Migration rehearsal: **all four passed**, fresh/legacy/phone-history/closure-history. Each verified 24 checksums, schema parity and replay, including both new SQL triggers. Existing seeded history was preserved and all four tagged rehearsal databases were removed by the script. Log: `.postgres-test/credit-review-presence-migrations.log`.
- First full quality gate: lint had 0 errors / 42 existing warnings and typecheck passed; units had **1,592 passed / 4 failed**, start **11:42:57 UTC**, 56.37 seconds, so build was not reached. Booking-response mock lacked the new transaction wrapper; migration-manifest fixture still expected 23 migrations; two unchanged esbuild cases timed out at 5 seconds. Updated transaction fixture now also asserts RepeatableRead, and manifest fixture asserts 24 entries plus the new migration name. No production logic was changed to satisfy mocks, and no timeout was increased.
- Focused gate retest: **53/53 passed**, start **11:44:49 UTC**, 3.28 seconds. Log: `.postgres-test/credit-review-presence-gate-focused.log`. Original full-gate failures remain in `.postgres-test/credit-review-presence-check.log`.
- Final `npm run check`: **PASS**, lint 0 errors / 42 warnings, TypeScript, **1,596/1,596 units** in 73 files (11:45:49 UTC, 28.03 seconds), Prisma generation and optimized Next.js build. Terminal exit 0 before local browser startup. Existing middleware-deprecation and Next.js Edge Runtime `process.cwd` warnings remain open. Log: `.postgres-test/credit-review-presence-check-final.log`.
- Independent pre-browser SQL read found the expected disposable marker and zero users/bookings/payments/purchases/redemptions after the full SQL suite.
- Browser cases, final cleanup and hosted publication/retest remain pending at this point.

## Browser Verification Scope

Environment: built local app `http://127.0.0.1:3108`, same guarded disposable database, synthetic parent/trainer/admin sessions, dummy provider keys. Stripe Connect/wallet widgets are intercepted; SQL receipts are explicit fixtures, not provider evidence. Command: `npm run test:e2e -- e2e/credit-reservation-local-regression.spec.ts e2e/credit-dashboard-local-regression.spec.ts e2e/credit-actions-local-regression.spec.ts --workers=1 --retries=0`. Viewports: 1440x1000 and 390x1000 for UI cases.

| Surface | Exact steps and expected result |
| --- | --- |
| `/parent/packages/[id]/book`, GET/POST `/api/bookings/credits` | Open clean credits, choose session/child/date/time, reserve once; retry lost/invalid responses with same request; spend across siblings. Reviewed credits show zero spendable and disabled reservation. |
| `/parent/dashboard`, `/trainer/dashboard`, `/admin/bookings` | Read clean/object-held/JSON-null-held/restored credit bookings. Held state is visible with no cash-payment action; trainer/admin completion disabled. Refresh preserves saved state. |
| `/api/dashboard/bookings`, `/api/bookings`, `/api/admin/bookings` | Verify HTTP 200/no-store, matching hold projections and no raw redemption/provider identifiers in tested DTOs. |
| PATCH `/api/bookings/[id]` | Owning parent/trainer early cancellation returns one credit exactly once, late parent cancellation retains debit, foreign parent rejected, admin cancellation blocked, premature outcomes rejected. JSON-null hold remains present after cancellation and reload. |

Initial browser/API regression: **56/56 passed**, one worker, zero retries, **8.9 minutes**, terminal exit 0. Log: `.postgres-test/credit-review-presence-browser.log`. Desktop parent/trainer/admin and mobile parent/admin screenshots were visually inspected and showed wrapped titles, readable hold warnings and appropriate controls.

The first mobile trainer viewport capture omitted several text runs despite passing DOM visibility assertions. It is retained locally as `.postgres-test/credit-review-presence-first-trainer390.png`; its cause is not established and that capture is not accepted as visual signoff. The test now additionally checks the long title's own scroll/client width and captures the full page. No application styling was changed based on the anomalous image alone.

The six-case recapture finished **5 passed / 1 failed**, 1.6 minutes, with no retries. The mobile trainer full-page image now shows all expected title/hold/session/credit text and controls. However, the first desktop parent case returned **HTTP 503** from `/api/dashboard/bookings?view=upcoming&page=1&limit=10` at **11:59:36.426 UTC**, request duration **2,297.601 ms**, before the new geometry assertion. The page displayed `Unable to load current bookings`; the server logged `Dashboard booking read failed`. Root cause is not established; this is not relabeled a visual failure or silently discarded. Log: `.postgres-test/credit-review-presence-visual-retest.log`; retained failure trace/context: `.postgres-test/credit-review-presence-parent-read-failure.zip` and `.md`. No timeout, assertion or automatic retry setting was relaxed. Complete selected-suite rerun is pending.

## Release Status

The complete pre-optimization browser rerun finished **55 passed / 1 failed**, 12.6 minutes, zero retries. The prior parent JSON-null case passed, but desktop late-parent invalid-JSON recovery failed because the real cancellation returned 503 before response interception. Server evidence: Prisma transaction expired at **5,136 ms** against its unchanged **5,000 ms** timeout during `booking.findUniqueOrThrow`. The failure also produced a fixture teardown foreign-key error, requiring independent cleanup verification. Log: `.postgres-test/credit-review-presence-browser-final.log`. A host memory read showed 1,698,420 KiB free out of 15,667,100 KiB; that does not establish memory pressure as the cause.

Code inspection found a redundant full account/profile/purchase/service/athlete/booking lock-and-read pass when an already locked booking action called the standalone restoration helper. The implementation now shares the restoration step with that standalone helper while booking actions reuse their existing locks and already validated active actor. Ownership/status checks, database time, SQL guards, atomicity and the standalone helper's locking remain. Cancellation also no longer queries a financial hold it does not use. No application or test timeout was increased. Added direct helper tests; focused/full regression after this optimization is pending.

### Cancellation Optimization Retest

- Independent cleanup read confirmed only two synthetic `browser-...@example.test` users survived the failed fixture teardown; booking/payment/purchase/redemption tables were empty. A transaction guarded by exact database/user/marker, account IDs/emails and unchanged empty money tables removed only those two rows. Follow-up users/sports/bookings/purchases counts were zero. No hosted data was changed.
- The browser test now forwards unexpected real responses unchanged and asserts the upstream 200 result from its main test flow, instead of throwing from the asynchronous route callback. A 503 still fails the same requirement; cleanup is no longer raced by that background assertion.
- An initial focused unit process stalled before executing tests and was interrupted. Single-worker retest, unchanged timeouts: **46/46 passed**, 2 files, **12:22:36 UTC**, 4.08 seconds. Log: `.postgres-test/credit-review-presence-restoration-unit-retest.log`.
- Complete credit SQL file: **197/197 passed**, **12:23:48 UTC**, 39.81 seconds. Log: `.postgres-test/credit-review-presence-optimized-credit-sql.log`.
- Complete SQL regression after optimization: **994/994 passed**, 16 files, **12:24:43 UTC**, 366.08 seconds. Log: `.postgres-test/credit-review-presence-optimized-full-sql.log`.
- Latest full quality gate and rebuilt-app browser verification are pending. The prior 503 observations remain recorded; the unrelated dashboard-read failure's cause is not established by this cancellation optimization.
- The first optimized `npm run check` passed lint (0 errors / 42 warnings) and types, then stopped at units: **1,602 passed / 2 failed**, 74 files, **12:36:49 UTC**, 77.53 seconds. Unchanged esbuild bundling and Prisma CJS-config compatibility cases exceeded their 5-second limits; build was not reached. Log: `.postgres-test/credit-review-presence-optimized-check.log`. Since subprocess-heavy security tests repeatedly timed out in parallel while focused runs passed, the unit configuration now uses one worker and serial files, matching the existing SQL test approach. No cases, assertions or timeouts were removed/relaxed. The full gate is rerunning with that bounded configuration.
- Final optimized `npm run check`: **PASS**, terminal exit 0, lint 0 errors / 42 warnings, TypeScript, **1,604/1,604 units** in 74 files (**12:40:04 UTC**, 65.57 seconds), Prisma generation and optimized build. Log: `.postgres-test/credit-review-presence-optimized-check-final.log`. The middleware-deprecation warning persists; the earlier Edge Runtime warning is retained as historical evidence, not claimed fixed by this pass.

**HOLD.** A refreshed signed-in parent UI, historical webhook counters or synthetic SQL receipts do not prove actual hosted trainer onboarding, checkout, destination transfer or payout. The full goal remains active.

## Final Local Result

- Focused desktop/mobile cancellation recovery after optimization: **2/2 passed**, 53.0 seconds, zero retries. Log: `.postgres-test/credit-review-presence-optimized-cancel-browser.log`.
- Final complete selected browser/API suite: **56/56 passed**, **8.4 minutes**, one worker, zero retries, completed before **12:54:56 UTC**. Log: `.postgres-test/credit-review-presence-optimized-browser-final.log`. The previous cancellation timeout and read failure did not recur in this run. This is bounded retest evidence, not proof that every future latency problem is eliminated.
- The optimized local server log contains startup/ready output and no reported application errors during these two runs: `.postgres-test/credit-review-presence-optimized-server.log`.
- Independent final SQL read confirmed the disposable marker and zero users, bookings, payments, purchases, checkout attempts, grants, receipts, redemptions and sports. Local Next server and the owned PostgreSQL cluster were stopped afterward.
- Six final full-page captures were visually reviewed: titles/warnings/control labels fit their panels, no horizontal overflow in the asserted surfaces, held outcomes disabled, cancellation still available to owning parent/trainer. The earlier missing-text viewport capture is superseded by these accepted captures; its unknown cause is not invented.

| Role | Desktop | Mobile |
| --- | --- | --- |
| Parent | [1440px](screenshots/credit-review-parent-1440.png) | [390px](screenshots/credit-review-parent-390.png) |
| Trainer | [1440px](screenshots/credit-review-trainer-1440.png) | [390px](screenshots/credit-review-trainer-390.png) |
| Admin | [1440px](screenshots/credit-review-admin-1440.png) | [390px](screenshots/credit-review-admin-390.png) |

Cash-payment financial-review projections still need their separate JSON-null audit; this credit-specific fix does not establish every financial reader as correct. Deferred email setup, CI execution, expiry/service-retirement policy and previous release gates also remain open.

## Published Preview Verification

- Source commit: `63bbb1ba3f51f827b7c3f8dfe81f3edf4ecdbaaf`, committed and pushed to `codex/payment-readiness-20261006` on 2026-10-13. Refreshed main remained `2067e743c54ffee669cd484f26dc472b157f1881`; main/Production were not modified.
- Vercel [deployment EAmFR59Z2](https://vercel.com/styleres-projects/trainr/EAmFR59Z2TajJQ4Bm1zYxuXEhBUb) is **Ready / Preview / Latest**, completed **13:06:21 UTC**, duration 55 seconds. Its UI shows source `63bbb1b`, the stable audit alias and `trainr-4wbed3h4r-styleres-projects.vercel.app`. GitHub's Vercel commit status is success.
- Browser control recovered via a fresh tab after the old deployment tab timed out/closed. Normal Vercel UI inspection showed `Audit staging schema upgraded; migration checksums verified.` in this commit's build log. This verifies the guarded initializer reported success; no direct hosted SQL mutation probe is claimed.
- Anonymous hosted smoke: **16/16 PASS**, **13:06:53-13:06:56 UTC**, terminal exit 0. Health reports database connected, public catalog returns zero trainers, protected reads/writes return 401, unsigned webhook returns 400. Exact methods/routes/status/contracts are in [the raw result](CREDIT_REVIEW_PRESENCE_HOSTED_SMOKE.json). No signed-in session, real charge or provider receipt was used. The script's `aliasSourceIndependentlyVerified: false` describes its own limited evidence; the separate Vercel UI observation above supplies alias/source mapping.
- [GitHub run 38402214551](https://github.com/StylereTech/trainr/actions/runs/38402214551) is **FAIL**, not green: `check` and `migrations` each ended with zero steps. Fresh UI annotations state: `The job was not started because your account is locked due to a billing issue.` No billing or runner setting was changed. Local green results are not substituted for hosted CI.
- Vercel install output reports seven high-severity dependency vulnerabilities. Fresh local `npm audit --json` completed with exit 1 and **eight high** affected packages, rooted in `braces` and propagated through micromatch/fast-glob/chokidar to Next ESLint/Tailwind packages. The [reviewed advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) lists versions through 3.0.3 affected and no patched version. Local/hosted counts differ; these are distinct observations, not eight independent exploits or proof of runtime reachability. No force downgrade/install was performed. Reachability review and an appropriate remediation remain a release gate.
- Trainer signup was re-inspected: credentials remain blank and terms unchecked. User handoff remains pending. Hosted Stripe checkout, Connect onboarding, destination transfer and payout remain **NOT VERIFIED**.

This publication completes the credit-hold fix's local and anonymous Preview verification, not overall production readiness. The goal remains active and all earlier failures above remain part of the audit record.
