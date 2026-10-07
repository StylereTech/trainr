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
