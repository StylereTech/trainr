# Connect Account Identity Audit

## Scope And Baseline

- Date/time: 2026-10-08 UTC, starting 09:13; final checks/publication recorded below.
- Baseline: `0eab36674bbbfaf75d84d0671f0ca30869771a16`; source changes are in the commit containing this report. Refetched main remains `2067e743c54ffee669cd484f26dc472b157f1881`.
- Environment/accounts: isolated Windows audit checkout, Node 22, loopback PostgreSQL `trainr_audit_20261008`, role `trainr_test`; generated `example.test` trainer accounts only. Stripe account creation/retrieval/links simulated. No real account creation, onboarding, charge, refund, transfer or payout.
- Prior baseline Vercel preview `8UoanTsf1YQo1gfUMXRj4PTD84XR` reports SUCCESS. This does not establish production deployment or runtime correctness.

## Findings And Fixes

1. CRITICAL: `/api/payments/connect` could replace a non-Express account or clear an existing account ID after a broad provider error, then create a replacement. Removed automatic replacement/reconnection. Existing identity survives missing-account, permissions/configuration and transport errors. Unsupported types require reviewed migration, not a setup button that changes the destination.
2. HIGH: two independent creation paths had no durable shared attempt and used inconsistent user/profile metadata. Both now share one transactionally reserved attempt, immutable pending creation email, trainer-profile metadata and provider idempotency key. SQL locks serialize reservation; conditional finalization never overwrites a changed identity. Creation evidence is retained when deactivation/revocation prevents attachment. Successful setup and account closure redact the attempt email.
3. HIGH: provider failures could return cached onboarding success and the UI could label payments ready. Canonical status now requires a fresh verified account; unavailable observations have null capability flags and false readiness, without deleting the identity. Legacy status maps the same observation. Dashboard validates the response, distinguishes unknown from not-started, and offers retry.
4. MEDIUM: setup callbacks trusted forwarded request host when environment configuration was absent. Callbacks now use the existing configured app-URL helper, never request headers. Both trainer UI entry points validate Stripe HTTPS redirect hosts and bound link-launch requests.

## Exact Verification

| Steps / endpoint | Expected | Actual |
| --- | --- | --- |
| Concurrent canonical and legacy POST setup for one unlinked trainer | One reserved attempt/key and one attached account | PASS, actual PostgreSQL locks/unique constraints; provider simulated |
| Fail creation response, change local email, retry POST | Identical persisted provider parameters/key | PASS |
| Age ambiguous attempt beyond 23 hours, POST again | 409, no new provider creation | PASS |
| Existing standard/custom account, POST | 409, account unchanged, no replacement/dashboard/onboarding link | PASS |
| Clear account ID on a trainer with a paid record or checkout attempt, initialize setup | Reconciliation required, no fresh Connect attempt | PASS, two focused real SQL cases; full rerun below |
| Existing cached-ready account, simulate missing account/auth/network failure, GET and POST both routes | Unknown status, preserved ID, no new account | PASS |
| Remove provider configuration while DB cached-ready remains true | False returned readiness and no provider request | PASS |
| Provider disables payouts, POST with spoofed Host | Persist false readiness; configured callback origin | PASS |
| Deactivate user or change destination while creation is in flight | Record returned account for reconciliation, do not attach/overwrite | PASS |
| Change role during dashboard-link creation | Deny response; never return private link | PASS |
| Anonymous, parent and admin invoke both GET/POST route families | 401/403 before provider calls | PASS |
| Close account with pending setup attempt | Email redacted, attempt retained, further setup denied | PASS |
| Inactive/suspended listing with existing Express account, POST setup | Financial dashboard access retained; listing remains inactive | PASS; user role/deletedAt, not listing availability, governs Connect access |
| Validate complete status and allowed Stripe HTTPS links; inspect SDK creation options | Reject malformed status and unsafe redirect; stable key and bounded provider request | PASS, 10 unit cases |

Focused run: 22 unit cases passed. Final guarded database run: **131 tests / 5 files passed in 16.99 seconds**, including 17 Connect cases. Initial full unit run passed 644 tests / 35 files, but build failed with Windows `EPERM` renaming Prisma's query-engine DLL while SQL tests still used it. No source diagnostic caused that build failure; rerun sequentially below. First sandboxed Vitest launch also failed reading its configuration; approved normal-runtime rerun passed. Browser/final build evidence follows below, not assumed.

## Migration And Recovery Operations

- Additive migration `20261008093000_add_connect_account_attempts` applied only to guarded disposable SQL. Requires staging rehearsal and ordered rollout with all preceding checkout/session/deactivation/refund migrations before deploying this source. Do not run production migration from these test results alone.
- A pending attempt can reuse its original key for less than 23 hours. After that, or after a returned account could not be attached, setup returns reconciliation-required. Never delete/reset the attempt or clear an existing trainer account to get past this response.
- Authorized operator must verify the Stripe platform, live/test mode, request logs, idempotency key, profile metadata, existing destination and provider account ownership. Reconcile payment/refund/transfer history and current user eligibility before any separately reviewed database attachment or account migration. Record evidence and approval. This pass does not add an automatic recovery/admin mutation endpoint or establish an ops SLA.
- Attempt IDs/provider identities remain for financial reconciliation; pending email is retained only until successful provider observation or account closure. Broader legal retention and external-provider erasure remain open.
- Stripe may prune idempotency keys after 24 hours; a retry after pruning is a new operation. The 23-hour application bound leaves a buffer and intentionally requires reconciliation for older ambiguity. [Stripe idempotency](https://docs.stripe.com/api/idempotent_requests).
- Express login links are only for eligible Express accounts. No assumption that a Standard/Custom account can be replaced without history migration. [Stripe login links](https://docs.stripe.com/api/account/create_login_link), [onboarding links](https://docs.stripe.com/api/account_links/create).

## Final Retest

- Final source: **644 unit tests / 35 files, 134 actual PostgreSQL tests / 5 files, lint, typecheck and 70-page production build passed**. Final unchanged full browser retest passed **51/51 in 2.9 minutes**. Four Connect cases cover desktop/mobile current-status contracts, explicit unknown state, recovery, redirect rejection and real unlinked canonical/legacy APIs. No provider account was created outside simulations.
- Visually inspected `connect-unverified.png` and `connect-status.png` for 1440px/390px under ignored `test-results/connect-local-regression-*`; verified the status panel/error copy and controls. Mobile horizontal-overflow assertions passed. Toasts temporarily overlay other content; these checks do not establish full accessibility or full-page rendering correctness.
- SQL fixture cleanup and local-service shutdown verified at the end of this pass; users, bookings, payments, Connect attempts, admin actions and notifications were all zero. Browser failure traces remain separately preserved in the ignored archive above. No production mutation or money movement occurred.

- Both previously timed-out desktop scenarios passed three unchanged repetitions each: **6/6 in 38.8 seconds**. No test timeout, assertion, public-card code or approval code was modified to obtain that result. The unexplained intermittent failure remains a test-stability risk even if the following full run passes.

- The final-source browser matrix initially finished **49 passed / 2 failed in 6.0 minutes**. Failures were desktop public-card navigation (`/browse` did not reach `/trainers/privacy-fixture` within the assertion deadline) and the desktop trainer-approval uncertainty fixture (click did not complete its visible/enabled/stable wait before 30 seconds). Both had passed preceding runs; neither file was changed in this pass. Server health remained HTTP 200. Root cause is not established, and these failures are not counted as passes. Original traces/error contexts retained locally under ignored `e2e-report/connect-timeouts-20261008/`. Unchanged focused repetitions and full retest results follow below.

- 2026-10-08 09:38 UTC: final SQL rerun passed **134 tests / 5 files in 15.68 seconds**. A pre-publication review corrected an overly broad listing-active restriction: disabling discovery/checkout must not disable the trainer's existing Stripe dashboard. Deleted users and revoked roles remain denied. A screenshot review also removed conflicting onboarding instructions during an unverified/disabled setup state. Full build/browser rerun follows below.

- 2026-10-08 09:29-09:33 UTC: sequential `npm run test:postgres` then `npm run check` exited 0. **133 SQL tests / 5 files, 644 unit tests / 35 files, lint, typecheck and production build with 70 generated pages passed**. Final SQL adds the two legacy-history guards to the preceding 131-test run. Existing unrelated lint/deprecation warnings remain.
- First browser matrix passed **51/51 in 3.2 minutes**, including real authenticated unlinked status reads through both routes and simulated provider-error/malformed/stale/recovery cases at 1440/390px. The guard-only server refinement was then rebuilt; final browser/screenshot evidence follows.

## Publication Proof: 2026-10-08 09:55 UTC

- Source/report commit `9e67d8883912cc3eb25160ed925b37eb790a12bf` pushed to `origin/codex/payment-readiness-20261006`; remote `ls-remote` matched local HEAD. Worktree was clean before this evidence-only follow-up. Main and the production deployment were not changed.
- Local fixture cleanup/service shutdown completed at 09:54 UTC with all six audited record counts zero.
- Post-push anonymous `https://trainr.cc/api/health`: HTTP 200, `ok: true`, `dbConnected: true`. `/api/payments/connect`, `/api/trainer/stripe-connect`, and `/api/admin/bookings`: HTTP 401. These are read-only checks on the older production code, not runtime proof of this commit.
- GitHub Actions run `37759932664`, job `113253602608`: failure, zero executed steps. Exact annotation: "The job was not started because your account is locked due to a billing issue." Hosted CI remains unverified despite local passes.
- Vercel preview `7hdUpYavEgkW6SAWNJu3wzqAUHzm`: PENDING at observation. No successful deployment/runtime claim. An isolated staging project/database with Stripe test-mode configuration was requested from the owner; no reply yet. No secrets requested in chat.

## Remaining Release Gates

Full goal remains active; money-flow/production signoff HOLD. Real Stripe checkout, Connect onboarding, destination transfer/refund/payout and bank proof remain unverified. Staging drift/rehearsal, correct Vercel project production rollout, main publication, registration/email/athlete flows, timezone/hold expiry, cancellation execution and remaining security/retention gates are still open. Profile payout-history pagination/read validation and broader financial UI remain audit work. Never infer a completed onboarding or actual payout from these synthetic tests.
