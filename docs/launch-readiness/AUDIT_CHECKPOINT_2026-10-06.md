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
