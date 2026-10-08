# Production Audit Checkpoint

- Date/time: 2026-10-06 PDT / 2026-10-07 UTC.
- Source baseline: `2067e743c54ffee669cd484f26dc472b157f1881` on `origin/main`.
- Working branch: `codex/payment-readiness-20261006`; final patch SHA is the commit containing this report.
- Environment: isolated Windows checkout; read-only smoke on `https://trainr.cc`.
- Account: unauthenticated production requests; synthetic identities in mocked tests. No customer payment or payout initiated.
- Status: IN PROGRESS, NOT PRODUCTION MONEY-FLOW SIGNOFF.
- The April reports below are historical evidence, not current verification. Fixable repository defects remain.

## Baseline And Environment

Fetched current main; preserved existing dashboard edits in the original checkout.
GitHub/Vercel commit status reported success for the baseline. This alone does not prove domain-to-deployment SHA mapping.
Production health reported HTTP 200, `ok=true`, `dbConnected=true`, without `dbUrl` or `dbError` in the successful response.
No current authenticated DB write/read-back, Connect capability inspection, checkout charge, bank payout, or refund was performed.

Initial `npm ci` failed with ENOSPC: C: had zero free space. Removed only the incomplete audit-created dependency directory.
An isolated dependency install on D: is being used to work around disk exhaustion. Never delete user data to make room.

## Exact Read-Only Smoke

Steps: issue unauthenticated HTTPS GET requests with a 30-second timeout; record HTTP status, not personal records or secrets.

| Route | Expected | Actual | Result |
| --- | --- | --- | --- |
| `/api/health` | Healthy database probe | 200, connected | PASS for connectivity only |
| `/api/bookings` | Reject anonymous request | 401 | PASS |
| `/api/payments/connect` | Reject anonymous request | 401 | PASS |
| `/api/trainer/stripe-connect` | Reject anonymous request | 401 | PASS |
| `/auth/signin` | Render sign-in page | 200 HTML | PASS for reachability only |
| `/trainers` | Exploratory route discovery | 404 | No index route exists; browse is `/browse` |

These checks do not establish authentication success, persistence, visual correctness, or payment completion.

## Fixes In This Checkpoint

- Centralize Connect readiness: details submitted, charges enabled, payouts enabled, not deleted.
- Recheck the live Stripe account before checkout and synchronize stale onboarding flags in both directions.
- Handle delayed successful checkout events; reject unpaid or amount/currency-mismatched checkout confirmations.
- Preserve the booking's stored fee split in checkout confirmation.
- Restrict booking responses to parent user ID/email; deny unknown roles.
- Remove database exception details from the public health response.
- Remove caller-host-based session fetching and per-request mutation of NEXTAUTH_URL; require verified JWT identity.
- Restrict authentication redirects to the application's exact origin.
- Add regression tests and a repository CI workflow without production credentials.

## Open Findings

| Severity | Finding | Required Fix / Proof |
| --- | --- | --- |
| Critical | Destination charges transfer trainer funds while webhook also credits a locally withdrawable wallet | Choose and enforce a single payout source; reconcile existing balances before enabling manual disbursement |
| High | Webhook replay/concurrency and out-of-order intent events can duplicate side effects or regress state | Atomic idempotent processing and replay/order tests against a real DB |
| High | Checkout retries lack an atomic claim; provider-success/DB-failure can orphan a payable session | Idempotency and recovery tests including concurrent requests |
| High | Cancellation promises refunds without executing Stripe refund/reversal | Implement and verify full/partial refund accounting and transfers |
| High | Booking availability conflict checks and coupon consumption are not atomic | Transactional concurrency tests and retry handling |
| High | Booking date and approval/active-trainer validation need hardening | Invalid/past date and ineligible trainer negative tests |
| Medium | Booking UI silently discards checkout errors; success URL alone triggers success messaging | Show recoverable checkout errors; derive payment state from persisted verified payment |
| Unverified | Parent and trainer authenticated flows, persistence, responsive UI | Fresh browser tests and DB read-back with approved test accounts |
| Unverified | Live paid booking and trainer bank payout | Approved controlled payment with receipt, event, transfer, payout IDs and reconciliation |

## Retest And Publication

Regression tests added for account restrictions, cache recovery, provider failure, unpaid/mismatched webhooks, sensitive fields, unknown roles, invalid tokens, redirects, and health error privacy.
Execution results and publication SHA must be recorded after completion; adding tests is not a passing result.
GitHub push authentication passed a no-write `git push --dry-run origin HEAD:main` check.
No claim is made that 100 build cycles or 1,000 test iterations were completed. These are upper bounds, not evidence.

## Operations Hold

Do not use local wallet balances as proof of money available for an additional trainer payment. Destination transfers may already have moved the same proceeds.
Do not certify live payouts, refunds, or production readiness based on the historical reports or a successful deployment alone.
Complete the remaining repository fixes and authenticated verification before requesting final money-flow signoff.

## Follow-Up: Direct Stripe Payouts

- Checkpoint `ea73c55` was pushed to `codex/payment-readiness-20261006`, not `main`.
- GitHub Actions run `37565908583` failed before any step started: "The job was not started because your account is locked due to a billing issue." This is an external CI blocker, not a test failure or pass.
- Vercel preview `47vF7GPhMwhgZx4DvPPSYPQPvnmi` failed. Build logs require authentication; root cause remains unverified.
- Subsequent local changes remove new legacy wallet credits, make trainer/admin legacy withdrawal mutations read-only, retrieve balances and recent bank payouts using the authenticated trainer's connected Stripe account, and show the actual payout schedule. No existing ledger data is erased or reclassified.
- The payout UI no longer presents legacy balances as withdrawable funds or fabricates zero balances during provider failures.
- New tests cover connected-account scoping, currency separation, provider errors, missing setup, manual payout schedules, and prevention of duplicate legacy disbursement. Execution results are pending.
- The Windows dependency install was stopped after proving slow removable-disk I/O (1 MiB write took 4,483 ms). Verification moved to an isolated temporary WSL checkout; this is not a successful build result.

V1 path: parent Checkout creates a destination charge; Stripe routes trainer proceeds to the connected account; Stripe pays the bank according to that account's payout schedule. A manual schedule does not automatically pay the bank and remains an operations readiness blocker until addressed through Stripe. No live schedule was changed by this audit.

Reference: [Stripe destination charges](https://docs.stripe.com/connect/destination-charges) and [Stripe payout schedules](https://docs.stripe.com/connect/manage-payout-schedule).

## Verification Stop: 2026-10-07 04:53 UTC

- The WSL dependency install was stopped when C: reached zero free bytes again. Its Linux filesystem's logical free space did not establish adequate Windows host storage.
- Cleared only the verified, regenerable Windows npm `_cacache` directory after approval. About 30 MB remained free afterward; repository sources and existing dashboard edits were preserved.
- WSL subsequently failed to start (`Wsl/Service/CreateInstance/E_FAIL`, distribution startup error 6). No further installer or build is left running.
- Current patch: NOT VERIFIED. No new unit-test, typecheck, lint, build, browser-render, persistence, or live money-flow pass is claimed. The payout changes remain on the audit branch; production main was not updated.
- Needed to resume verification: adequate host disk space (at least 4 GB; more is preferable), a functioning WSL or local runtime, Vercel build-log access, and resolution of GitHub's billing lock for hosted CI.
- Another confirmed source-level defect: the admin payout page expects `payments` and `summary`, while `/api/admin/payouts` returns `withdrawals`. The finance view's API contract needs correction and regression coverage before signoff.
- Remaining goals are unchanged: finish repository money-flow fixes, verify all parent/trainer flows and persistence, run responsive browser tests, reconcile legacy payout records, obtain controlled Stripe payment/refund/bank-payout evidence, then publish to main and retest production.

## Live Browser Audit: 2026-10-07 05:07 UTC

Environment: production `https://trainr.cc`, in-app browser. Source baseline for this pass: audit branch `6effb8c187c74f6cb2704e6700f6c158fa885c77`; production is not running the audit branch, and the production deployment SHA was not independently established. Accounts: repository-designated parent/trainer/admin test fixtures. No passwords, session tokens, child records, or screenshots containing account data are published here. All test sessions were signed out.

| Flow / Route | Exact Read-Only Steps | Expected / Actual | Result And Scope |
| --- | --- | --- | --- |
| Parent `/auth/signin` | Submit the parent fixture through the real form | Reach parent dashboard / reached it | PASS: one existing account login |
| `/parent/dashboard` | Reload and wait for athlete section | Saved athletes remain visible / two remained visible | PASS: existing record readback; not new-write persistence |
| Parent role protection | Navigate to `/trainer/dashboard` as parent | Redirect / returned to parent dashboard | PASS: this UI boundary |
| `/browse` | Open Find Trainers and wait for results | Trainer list / 11 results under the displayed Texas filter | PASS: discovery read |
| `/trainers/marcus-johnson` | Open the designated trainer profile | Profile and booking link / rendered | PASS: this profile only |
| `/book/marcus-johnson` | Select the private 60-minute service, a saved matching athlete, October 7 and 09:00 | Summary and enabled submit / $60 and enabled Book & Pay | PASS: form selection only; no booking submitted or payment attempted |
| Trainer `/auth/signin` | Submit trainer fixture through real form | Reach trainer dashboard / reached it | PASS: one existing account login |
| Trainer role protection | Navigate to `/parent/dashboard` as trainer | Redirect / returned to trainer dashboard | PASS: this UI boundary |
| Trainer profile Services | View saved offerings without saving | Existing offerings / two services rendered | PASS: read only; upload/edit/save not verified |
| Trainer profile Availability | View weekly schedule without saving | Saved hours visible / morning windows rendered | LIMITED: additional windows are not shown by the editor |
| Trainer Stripe status | Wait for the dashboard status request | Verified capability state / connection error after three retries | FAIL: live Stripe connectivity/readiness not established |
| Trainer payout tab | Open Earnings & Payouts | Accurate provider state / bank-unconnected message despite preceding provider error | FAIL: ambiguous error presentation on current production |
| `/admin/payouts` | Open finance page as designated admin test fixture | Payment records / client-side exception | FAIL: `Cannot read properties of undefined (reading 'totalRevenue')` |
| Mobile availability | Render at 390 x 844 and inspect screenshot | Time inputs inside day row / right input extends outside row | FAIL: visual overflow; document-level overflow check alone missed it |

Additional findings: current public pages show unsupported-looking verification/scale claims and implementation commentary; these claims need evidence or removal. The trainer editor exposes only the first daily availability window, and service updates match offerings by array index instead of stable ID. These remain open until corrected and tested. Privileged credential remediation is urgent and was communicated directly to the owner; production security signoff is withheld.

### Follow-Up Fixes And Focused Proof

- Added `view=payments` to the existing admin endpoint with payment rows, bounded/validated pagination, explicitly named recorded-payment totals, restricted parent contact fields, and private/no-store responses. Default/legacy withdrawal history remains read-only and available.
- Updated the finance page to request that contract, handle incomplete/error responses without crashing or inventing zero totals, and distinguish recorded trainer share from bank payout proof.
- Stacked trainer availability time controls on narrow screens; added accessible time labels and a focused Playwright containment test.
- Executed the real admin route handler through Node VM modules with mocked NextAuth, Prisma and NextResponse: summary arithmetic, six invalid-query cases, role guards, legacy history, read-only mutation rejection, and DB failure behavior passed. This is NOT a live API/DB integration test.
- Executed 10 assertions against the actual dependency-free Connect readiness helper: all boolean combinations, deleted account, and incomplete account passed.
- Parsed 19 changed TypeScript files using Node's TypeScript stripping and VM module parser. This is a syntax check, NOT `tsc`, lint, a TSX build, or execution of the full Vitest suite.
- `git diff --check` passed before publication. Full unit/integration/E2E/build gates and post-deploy retests remain pending.
- The second Vercel preview (`A3AmGaaUxWMQ7eK3dkskWyr3vV8J`) also failed; authenticated build-log access is still required to determine why.
- C: dropped below 1 MB free during this pass. No dependency install was restarted and no production deployment was promoted.

## Resumed Verification: 2026-10-08 UTC

Source under test: `4d50a849949bf1873b82e76b6fdb2285d330fdf7` plus the local Stripe SDK compatibility fix and regression test. Windows Node 22.23.1; fresh `npm ci` completed (551 packages). Prisma Client generation passed after allowing the official engine download. No production credentials were copied into the worktree.

- Authenticated Vercel inspection of preview `6egbRL99w9qdBf3ZPYCL48j6wNZc` established the compile failure at checkout route line 117: Stripe's active `Account` has `deleted?: void`, incompatible with the helper's `deleted?: boolean`. The helper now accepts both SDK forms; readiness still rejects deleted accounts and requires all three capabilities. A regression test uses the SDK's actual property types. Full-check results are recorded below when available.
- Domain inspection established that `trainr.cc` and `www.trainr.cc` belong to **`trainr-node`**, not the Git-connected **`trainr`** project. The live project's current production deployment is `FEp6XgWZotobnxofLrhpssQdJoWN`, created May 31, with source metadata `2067e74`. It has no Git connection. Source metadata does not prove a manually uploaded deployment is identical to that Git commit.
- The Git-connected `trainr` project serves `trainr-xi.vercel.app`; its production deployment is `Abo7EvAe6jZceHWivStRp7RDzVtr`. An audit branch push triggers a preview there, not a deployment to `trainr.cc`. No DNS, project connection, or production promotion was changed.
- The live project's environment-variable page shows production-scoped `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, Stripe public-key variables, and platform-fee configuration. Values were not revealed. Presence is not credential validity or successful webhook delivery. Vercel flags four sensitive-looking variables stored as Config; owner review/rotation and Secret classification remain pending.
- Read-only `https://trainr.cc/api/health` returned HTTP 200 with healthy/database status true and Vercel response headers. This does not validate payment connectivity or new-write persistence.
- GitHub Actions run `37574837796` did not start any job steps: account locked due to a billing issue. This external CI blocker remains; it is not a code test result.

Account/context: owner-authorized Vercel session for read-only deployment/settings inspection; local tests use mocks and no live customer account. Expected result was a successful preview and accurate production mapping; actual result was a proven compile failure and separate manual production target. Build fix is local pending retest/publication; live money-flow signoff remains withheld.

### Local Quality Gate: 2026-10-08 03:19 UTC

Exact steps: fresh `npm ci --no-audit --no-fund`, `npm run db:generate`, then `npm run check` in the Windows audit worktree. Expected: all checks exit zero. Actual: **PASS**, complete check exited 0.

- Lint: passed with warnings (unused symbols, hook dependencies, image optimization); not warning-free.
- Typecheck: `tsc --noEmit` passed, including the actual Stripe SDK account type regression.
- Vitest: **13 files / 110 tests passed**, no skipped tests reported. Provider-failure cases use mocks; their expected error log is not a live Stripe request.
- Production build: compiled successfully in 73 seconds, checked types, generated all 68 static pages, completed build traces and route summary, exit 0. Next.js reported an inferred workspace-root warning from an unrelated parent lockfile and stale Browserslist data.
- `git diff --check`: passed. Source/test fix and this evidence are being published together; the commit containing this section identifies the exact tested code.

This clears the observed SDK compilation blocker locally. It does not establish browser E2E, live database writes, checkout, refunds, payout settlement, or final production readiness. The earlier open money-flow and security findings remain open. Remote preview retest and explicit deployment to the correct production project are still required.

### Remote Retest Of SDK Fix

Published commit: `f11e1e3e606de750bfa6b9314c3f69709ea6c736` on `codex/payment-readiness-20261006`; remote ref matched local HEAD and worktree was clean. Vercel preview `D5MCHEzzHUPCtbiLs54YKX6XJoLe` reached **Ready** on 2026-10-08 03:20 UTC. Authenticated Vercel logs showed completed compilation, serverless functions and deployment. Opened `https://trainr-30k6m90y1-styleres-projects.vercel.app/` in the browser and observed the rendered homepage and navigation. PASS: preview build and homepage load only, not authenticated payment flows. GitHub Actions run `37722165511` again failed before starting steps because of the billing lock. Production/main were unchanged.

## Transactional Payment Event Pass: 2026-10-08 UTC

Baseline: `f11e1e3e606de750bfa6b9314c3f69709ea6c736`; exact patch is the commit containing this section. Environment: local Windows worktree, synthetic payment fixtures, no customer account or live Stripe request. Route: `POST /api/payments/webhook`; implementation: `src/lib/stripe-payment-events.ts`.

Confirmed defects before editing: duplicate success events emitted notifications repeatedly; independent payment/booking/notification writes could partially succeed; payment failure or success snapshots could overwrite settled/refunded states; late success unconditionally reconfirmed cancelled bookings; refunds could regress from full to partial. Transfer metadata alone could attach an unrelated transfer ID.

Fix: serialize each booking/payment's event writes in one PostgreSQL transaction with row locks; require matching stored payment identity, amount and currency; retain cumulative refunds; confirm only pending bookings; notify on transitions, not every delivery; flag cancelled/rescheduled late payments for reconciliation without reopening the booking. Both intent and Checkout success events use the same operation. Persistence errors return retryable 503, mismatched financial evidence returns 409, and signature errors remain 400. Raw database/provider error details are not returned. No wallet credit, refund creation, transfer or payout is issued.

Exact local steps: `npm run typecheck`; `npm test -- tests/payment-readiness.test.ts tests/stripe-webhook-ordering.test.ts`; then `npm run check`. Focused results: 36 tests passed. Full suite: 14 files / 134 tests passed. Cases cover replay, both success-event orders, rollback on notification failure, terminal bookings, failed-then-successful intent, full/partial refund ordering, wrong IDs/amount/currency, invalid refunds and missing payment records. Build result is recorded after the command completes.

Limitations/open blockers: the stateful test harness models rollback; it does not prove real PostgreSQL lock behavior or concurrent connections. No dedicated test database is configured and neither `psql` nor Docker is available in this shell. An isolated staging database and Stripe test-mode environment were requested. Checkout retry creation still needs durable idempotency; **do not promote this branch to production until that coupled path is fixed and retested**. Cancellation/refund execution and reconciliation remain open. No live money-flow signoff is granted.

References: [Stripe webhook delivery behavior](https://docs.stripe.com/webhooks) and [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests).

### Coupled Checkout Guard And Signature Retest

The initial 134-test quality gate completed successfully, including production build. Then guarded checkout finalization with a conditional update that only attaches the session to the unchanged pending/failed payment; it no longer resets captured/refund fields. If a webhook or competing request changes state first, checkout returns 409 without a URL. Uncertain Stripe/database failures retain the existing payment row rather than deleting the identity needed for reconciliation. Four tests cover these writes and failure paths. This does **not** solve duplicate external session creation or recovery after uncertain provider outcomes; a durable checkout-attempt/idempotency design is still required.

Added six route tests using the actual installed Stripe SDK signature verifier and synthetic signing secrets: valid unpaid event, modified raw payload, wrong secret, stale signature, missing signature, and retryable persistence failure without raw error disclosure. No network/payment is involved. Reran `npm run check`: lint/typecheck passed and all **15 files / 144 tests passed**. Final build result follows. Expected failing-provider log messages occurred only in the corresponding synthetic tests.

Final result: **PASS**, complete `npm run check` exited 0 on 2026-10-08 approximately 03:35 UTC. The build compiled, validated types, generated 68 static pages and finished traces. `git diff --check` passed. Initial sandboxed Vitest invocation failed resolving the Windows config with access denied; the authorized unsandboxed rerun passed. Disk space was monitored; only the verified npm download cache was cleared with approval, preserving installed dependencies and all source/application data. No migration, database write or financial action was performed. Publish this checkpoint to the audit branch only; the production hold remains in effect.

### Publication And Remote Gate: 2026-10-08 03:37 UTC

- Code commit `cdbb06360d1c6947c53b09a38ea74d842698c90a` pushed to the existing audit branch; remote ref matched and the worktree was clean.
- Vercel deployment `AKFw26ogCUtaJSa65KES8oM4T5tX` reached **Ready**, source `cdbb063`, preview `https://trainr-4jm29a5vp-styleres-projects.vercel.app`, build/deploy duration 57 seconds. PASS: remote deployment build only.
- Unsigned POST probes to `/api/payments/webhook` and `/api/payments/checkout` returned Vercel protection 401, not application responses. GET probes to `/api/bookings` and `/api/health` redirected to Vercel sign-in HTML; their final HTTP 200 is **not** an API pass. The authenticated browser's direct health navigation was blocked by the client. No protection was disabled or bypass token extracted. Remote API behavior remains UNVERIFIED.
- GitHub Actions run `37723451273`, job `113136130304`: billing lock prevented job start. Local checks above remain the executed quality evidence.
- Production/main unchanged. Next critical work is durable checkout-attempt recovery/idempotency and real isolated PostgreSQL/Stripe test-mode verification, followed by cancellation/refund execution, remaining account/UI/persistence audits, explicit deployment to `trainr-node`, and controlled live money-flow proof.

## Durable Checkout Pass: 2026-10-08 UTC

Baseline `4de8acd039cc5de6f6a63da6b39bb22392d3bcda`; exact code is the commit containing this section. Routes: `POST /api/payments/checkout`, `POST /api/payments/webhook`. Environment/accounts: local Windows with synthetic parent, trainer, payment and Stripe fixtures. No live account or financial mutation used.

Implemented durable `CheckoutAttempt` rows and additive SQL migration. Preparation locks booking/payment rows, saves immutable Stripe parameters and a unique attempt key, then releases the transaction before the provider call. Concurrent requests share the active attempt. Retries resume open sessions; uncertain creation/save results reuse the same key and parameters. Unknown outcomes outside the conservative 23-hour recovery window fail closed. Missing resources and generic Stripe invalid-request errors no longer permit a new session. Verified expired sessions can be replaced only with no intent or a cancelled intent; old attempts are retained. Existing legacy records with unknown outcomes require reconciliation.

Webhook evidence includes attempt identity, so delayed events cannot cross into replacement attempts. The handler can recover session identity when a webhook wins the race. A checkout retry that finds a verified paid Stripe session reconciles it through the same transactional handler. Request bodies and parent roles are validated; raw provider errors are not returned. Live Connect readiness is still checked before checkout.

Executed: local `npm run db:generate` passed (client generation only, not migration); `npm run typecheck` passed; focused four-file suite initially passed 76 tests. After adding paid-session recovery and legacy expiry coverage, `npm run check` lint/typecheck and all **16 files / 178 tests** passed; final production-build result follows. Existing lint warnings remain.

**Deployment blocker:** apply and verify the additive migration in isolated PostgreSQL before promoting this code. Neither a real SQL migration nor independent-connection concurrency test has run. The model tests deliberately identify this limit. See [checkout migration and staging gate](CHECKOUT_ATTEMPT_MIGRATION.md) for exact rollout order, required evidence and reconciliation rules. No schema change has been applied to production; full money-flow signoff remains withheld.

Final retest, 2026-10-08 approximately 03:54 UTC: the 178-test full gate completed, then final review added stored session/intent consistency guards and two regression cases. Reran the full `npm run check`: **PASS**, exit 0, lint with existing warnings, typecheck, **16 files / 180 tests**, and completed production build (68 static pages). `git diff --check` passed. Tests include exact saved-parameter/key reuse, concurrent request simulation, failed persistence, expired/unknown outcomes, provider/legacy identity mismatches, fast webhook settlement, cancellation races and webhook attempt identity. Real SQL migration, multi-connection locking, provider-side test-mode charges and bank payouts remain unverified. This pass made no database or financial changes.

Publication/retest, 2026-10-08 03:55 UTC: code commit `c07df9d9d658f42fb95ba2677ec8c4b6f06906a9` pushed to `codex/payment-readiness-20261006`; remote ref matched and worktree was clean. Vercel preview `HrtXtYzZAvXQihjWcAg1EpNRmgDm` reached **Ready** in 1m 5s, source `c07df9d`, URL `https://trainr-aaee1223y-styleres-projects.vercel.app`. PASS: remote build/deployment only. No authenticated checkout was exercised against an unverified schema. Main, production and database migration state were not changed. The staging and migration gate above remains mandatory.

## Atomic Booking Pass: 2026-10-08 UTC

Baseline `7bea3b1e878e2915d02ab6a70204e4e765bbff27`; the commit containing this section identifies the revised code. Environment: Windows Node 22, local production build, synthetic parent/trainer/athlete/coupon fixtures only. No production records, credentials, charges or payouts used. Routes/surfaces: `POST/GET /api/bookings`, public trainer availability response, `/book/[slug]`, `/parent/dashboard`, simulated checkout response.

Findings fixed in source:

- Reservation conflict reads and inserts were separate; coupon usage could commit before a failed reservation. Creation now runs in one transaction, locking trainer, service, athlete and applicable coupon rows, and writes its notification atomically.
- Validates active/approved trainer, active service, athlete ownership and sport, valid clock/calendar values, whole-session availability, same-athlete conflicts and group capacity. Invalid coupons fail explicitly, including exhausted, expired and sport-restricted codes. Discounts cannot exceed price.
- Blackouts were filtered from both the reservation check and public trainer response. Shared availability rules now apply blackout precedence, one-off dates and valid duration/window bounds. The form deduplicates sorted valid starts; trainer profile summaries do not list blackouts as available hours.
- Zero-due reservations are confirmed with a zero-value settled record and no provider charge or payout. The form skips checkout for them; the parent dashboard says "No payment due" rather than "Paid".
- Checkout errors remain visible. Pending unpaid reservations regain the dashboard retry action; refunded/settled records do not get that action. `?payment=success` no longer fabricates a payment-success toast.
- Booking list filters and pagination are bounded/validated; unexpected persistence errors do not expose database details.

Verification to date: focused initial run **66 tests passed**; first full `npm run check` passed lint (existing warnings), typecheck, **19 files / 251 tests** and production build. Added public availability contract test and dashboard retry assertions, then reran the full gate; final result is recorded below after completion. Model tests explicitly simulate serial transactions and rollback, not PostgreSQL locks. Route tests execute handlers with mocked dependencies.

Browser steps: start the local production build at `http://127.0.0.1:3107` with a synthetic local-only auth secret; set matching `LOCAL_E2E_SECRET`, `BASE_URL` and `LOCAL_E2E_CHANNEL=msedge`; run `npx playwright test e2e/booking-local-regression.spec.ts --project=chromium --workers=1`. The fixture skips without a loopback URL and explicit local secret. All API responses and account identity are synthetic; no live database or Stripe calls are involved. Desktop 1440x1000 and mobile 390x844 select a service, athlete and date, reject blackout start times, submit the remaining slot, check checkout failure or zero-due handling, refresh the dashboard and reject query-string-only success. Initial **4/4 passed** in installed Edge. Default Chromium first failed to launch because expected revision 1217 was missing; an initial browser-channel fixture configuration error was corrected. These were harness failures, not app passes. Screenshot inspection confirmed visible submit/error controls; the dashboard recovery action is being retested after its fix. Screenshots live under ignored `test-results/booking-local-regression-*/`.

Open repository work is NOT reclassified as external: trainer timezone/past-start semantics; expiring unpaid holds and coupon lifecycle; sub-minimum positive Stripe totals; cancellation/refund execution; trainer service stable-ID editing and multi-window availability editing; remaining error/empty states and misleading marketing/interface copy. No real SQL concurrency, production persistence, Stripe checkout, refund, transfer or bank payout is claimed. The checkout-attempt migration/staging gate, privileged credential remediation, GitHub billing lock and separate `trainr-node` production deployment remain unresolved. Main and production remain on hold; money-flow signoff is withheld.

Final local retest, 2026-10-08 approximately 04:18 UTC: **PASS**, full `npm run check` exited 0, lint with existing warnings, TypeScript, **20 files / 252 tests**, and completed production build with 68 generated pages. Restarted the rebuilt local app and reran the strengthened Playwright fixture: **4/4 passed in 24.7 seconds**, including the pending-payment retry after refresh on both screen sizes, explicit zero-due labels and no checkout for free bookings. Inspected desktop error, mobile submit and final mobile recovery screenshots; retry button and error text were visible. Stopped the synthetic local server after testing. `git diff --check` passed; source and evidence are ready for audit-branch publication only.

Publication/retest, 2026-10-08 approximately 04:20 UTC: code commit `1cf3d8148982479922ca85c462ae27126a04826b` pushed to `codex/payment-readiness-20261006`; `ls-remote` matched local HEAD and the audit worktree was clean. GitHub's Vercel status for this exact SHA reports **success / Deployment has completed**, deployment [E1pyfkUfTzkxQ6MsiHiamas7K5uW](https://vercel.com/styleres-projects/trainr/E1pyfkUfTzkxQ6MsiHiamas7K5uW). PASS: remote deployment status only, not remote database/payment behavior. GitHub Actions run `37726780460`, job `113146645928`, ran zero steps: "The job was not started because your account is locked due to a billing issue." The original `trainr-main` checkout still contains its seven pre-existing modified/untracked files; they were not changed by this pass. Main remains `2067e743c54ffee669cd484f26dc472b157f1881`; no production promotion or migration was performed.

## Booking Lifecycle Integrity: 2026-10-08 UTC

Baseline `0cabd2557962a44f4b6365512ea407ed76121f9f`; exact revised source is the commit containing this section. Routes: `PATCH /api/bookings/[id]` and `PATCH /api/admin/bookings`. Accounts/environment: synthetic owned parent/trainer/admin fixtures in local Windows tests; no production mutation.

Source inspection found that trainer confirmation required no payment evidence, completion incremented counters before the status write, notifications/audit were separate commits, admin actions could resurrect terminal bookings, and trainer cancellation promised a full refund without submitting one. Both endpoints now delegate to one locked transaction in booking-then-payment order. It checks actor ownership/role, permits only defined transitions, requires a matching fully settled non-refunded payment for confirm/complete/no-show, makes identical retries side-effect free, and commits status, completion counters, notifications and admin audit together. Invalid input is 400, forbidden actor 403, conflicting transition/payment 409, unexpected persistence failure 503 without raw diagnostics.

Cancellation now notifies both parties honestly: it is not a refund receipt. Nonzero existing payments that are not fully refunded generate administrator review notifications, including pending/uncertain checkout records. No provider financial action is fabricated. The zero-due case does not claim money was paid. The outdated wallet-withdrawal runbook has been replaced with the actual Stripe-managed payout/reconciliation path and explicit release holds.

Exact local verification: `npm test -- tests/booking-actions.test.ts tests/booking-action-routes.test.ts` passed **50 tests**. Cases include duplicate completion, competing completion/cancellation, rollback on counter/notification/audit failure, terminal-state resurrection attempts, unpaid/partially refunded/mismatched payment rejection, owner/admin cancellation, uncertain checkout, repeated admin cancellation, malformed bodies, privacy and role boundaries. The transaction harness is a serial model, NOT an independent-connection PostgreSQL test. `npm run check` then passed lint with existing warnings, typecheck and **22 files / 302 tests**; final build result follows. No browser E2E or live provider test is claimed for this backend-only pass.

**Still incomplete, not an external-only blocker:** actual cancellation must resolve open/uncertain checkout, calculate the approved refund/credit entitlement, durably submit/reconcile refunds and destination reversals with idempotency, and distinguish pending/failed provider outcomes. The published policy promises automatic full trainer-cancellation refunds and late credits, plus parent timing-based refunds; there is no trainer timezone in the schema. Owner confirmation of policy and trainer-timezone collection was requested, but no replacement policy was invented. Current UI action controls also need to reflect settled-payment eligibility. These requirements remain part of the full goal; this integrity pass is not a substitute for them or permission to launch.

Provider design reference checked during this pass: [Stripe refund API](https://docs.stripe.com/api/refunds/create). Transfer reversal and application-fee refund are separate explicit controls; operator instructions require checking the actual related objects and refund status. No refund, reversal or payout was executed. All previous staging, migration, privileged-account, billing and correct-production-project gates remain.

Final local gate, 2026-10-08 approximately 04:26 UTC: **PASS**, `npm run check` exited 0 after lint (existing warnings), typecheck, **302 tests in 22 files**, compilation, 68 static pages and completed build traces. `git diff --check` passed. Source and updated operations guidance are being published to the audit branch only. No migration or production financial action occurred.

Published code `fabd6062d07c349aa7e9318c494b11d32e7f2003`; remote audit branch matched local HEAD and was clean. GitHub's Vercel status reports **success / Deployment has completed** for [FVS9mVmQxhKs7eEwJP1eFJugA6MS](https://vercel.com/styleres-projects/trainr/FVS9mVmQxhKs7eEwJP1eFJugA6MS). This is remote build evidence only. GitHub run `37727360053`, job `113148474278`, executed no steps; failure annotation again identifies the account billing lock. A separate read-only production probe returned `HTTP 200`, `ok: true`, `dbConnected: true` from `https://trainr.cc/api/health`; this older production deployment has NOT received these fixes, and this response proves neither writes nor payments. Main, production and schema state remain unchanged.

## Trainer Edit Integrity: 2026-10-08 UTC

Baseline `2c775a32147901ac90868d7bac5ee6ed714e8434`; exact source is the commit containing this section. Surface: `GET/PUT /api/trainer/onboarding`, `/trainer/profile`. Local Windows Node 22 with synthetic trainer/service/availability fixtures only.

Inspection confirmed positional service updates ignored submitted IDs: deleting or reordering a service could overwrite an unrelated booked offering. Profile save also deleted every availability row, including one-off/blackout exceptions. The weekly editor displayed only the first window for each day and changed all windows together.

Implemented owned stable-ID matching with duplicate/foreign/inactive-ID rejection. Removed offerings are archived, not deleted. Unreferenced services can update in place; changed offerings already referenced by a booking or package are preserved and a new active version is created, retaining sport identity. Unchanged booked terms do not create a version. The transaction holds the trainer row lock used by booking creation. GET returns an edit revision; PUT checks it under the lock and rejects stale/missing revisions for existing offerings. First onboarding with no saved services remains supported. Save responses return the active IDs and new revision, and the editor adopts them before a second save.

Weekly schedule writes now replace only recurring, available, non-date-specific rows. Date exceptions, blackout windows and unavailable records remain intact. The editor renders every weekly window with independent time fields and add/remove controls. An empty weekly schedule is allowed. Invalid time ranges, fractional/out-of-range days and invalid service pricing/capacity/duration fail before writes.

Focused `npm test -- tests/trainer-profile-save.test.ts`: **26 passed** after correcting two table-driven test arguments that had accidentally submitted a service object instead of an array. Coverage includes reorder/remove, booked/package-linked versioning, unchanged history, stale/concurrent saves in a serial model, returned-ID reuse, first onboarding, rollback after a later availability failure, exception preservation, closed schedule, validation and roles. This is NOT PostgreSQL concurrency or actual database persistence proof. Full gate so far: lint with existing warnings, TypeScript, **23 files / 328 tests passed**; build/browser results follow.

Open related work: date-exception creation/edit UI; trainer timezone and past-session validation; sport/specialty reference validation and service-sport selection; preserving certification verification on unrelated edits; package purchase flows; controls reflecting lifecycle payment eligibility. No staging database, migration or live provider test was performed. Production and final money-flow signoff remain on hold.

Final local gate, 2026-10-08 approximately 04:35 UTC: **PASS**, complete `npm run check` exited 0 with existing lint warnings, TypeScript, **328 tests / 23 files**, and completed production build with 68 generated pages. Started the rebuilt app on loopback port 3107 with synthetic-only credentials and ran `npx playwright test e2e/trainer-profile-local-regression.spec.ts e2e/booking-local-regression.spec.ts --project=chromium --workers=1`, using `BASE_URL`, matching `LOCAL_E2E_SECRET` and installed Edge via `LOCAL_E2E_CHANNEL=msedge`: **6/6 passed in 32.9 seconds**. Profile cases at 1440px and 390px verified returned service-ID/revision reuse, individual window edits, add/remove controls, row containment, refresh with retained synthetic state, and visible 409 feedback. The four parent checkout-recovery regressions also passed. Inspected desktop/mobile weekly-window screenshots under ignored `test-results/trainer-profile-local-regr-*/weekly-windows.png`. Browser API responses were mocked; this is not real persistence or payment proof. Stopped the local fixture server. `git diff --check` passed; remote main and audit baseline were unchanged before publication.

Publication: code `cef7f7a13f182281999c8ecae476af66544c6e6e` pushed to the audit branch; remote ref matched and worktree was clean. Vercel's GitHub status reports **success / Deployment has completed** for [6PipVFpckxMCoEuHiEyHY7AsYHno](https://vercel.com/styleres-projects/trainr/6PipVFpckxMCoEuHiEyHY7AsYHno). Remote profile writes were not exercised; this is build/deployment evidence only. GitHub run `37728156497`, job `113150936321`, had zero steps and the confirmed account billing-lock annotation. No new migration was added in this pass, but the earlier checkout-attempt migration remains unapplied/unverified. Main and `trainr.cc` remain unchanged.
