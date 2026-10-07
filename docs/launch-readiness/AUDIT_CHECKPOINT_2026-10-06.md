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
