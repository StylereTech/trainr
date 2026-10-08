# Checkout Account Revocation Audit

## Identity And Finding

- Date/time: 2026-10-08 UTC; reproduction and focused verification 17:08-17:13.
- Baseline: `4df968e5d09b3f44678b948b4c5e1f4dd6b3d02a`, branch `codex/payment-readiness-20261006`. Clean worktree verified before changes. Previous booking-action authorization fix was published progress.
- Environment: local source, optimized build and guarded PostgreSQL `trainr_audit_20261008` on loopback port 55439. Synthetic `audit-<UUID>-parent@example.test` / trainer accounts and Stripe mocks only. No real Stripe session, charge, payout or production account mutation.
- P1 finding: Checkout trusted ownership and earlier route authentication but did not lock/revalidate the buyer's current role/deactivation state in its transactions. Cached requests could create a session for a revoked buyer, or return a URL after revocation committed during Stripe create/retrieve. Trainer unavailability withheld URLs but did not attempt expiry of the returned open session.
- Status: local remediation verified and published on the audit branch; exact evidence follows below. Production and money-flow signoff remain **HOLD**.

## Changes

- Before preparing payment/attempt records, lock the buyer user row FOR SHARE and require current PARENT role with no `deletedAt`. Use user-before-booking/payment/trainer lock order. No buyer lock spans an external Stripe request.
- Recheck the buyer under the same lock when finalizing the returned provider session. Persist its validated identity to the payment and attempt even if the buyer was revoked, then withhold the URL outside the transaction. Trainer unavailability likewise withholds the URL.
- For a returned open/unpaid session whose buyer/trainer is no longer eligible, attempt expiry with an eight-second request timeout, zero SDK retries and a stable `trainr-withheld-<sessionId>` idempotency key. Validate the response identity/amount and expired/unpaid state, including no enabled recovery. Log a generic reconciliation warning on failure or inconsistent response; never release the URL regardless of expiry outcome.
- Do not automatically cancel the booking, refund a payment, reverse a transfer, retire the attempt or label the payment FAILED. Expiry is not a refund. Provider or webhook activity that wins the race remains authoritative financial history. The response requires support reconciliation even if the expiry request succeeds; unresolved PaymentIntent/bank-payout state is not signed off here.
- A currently authorized parent may later resume through the existing flow, which retrieves the same session and replaces it only after verifying expiry and any old PaymentIntent. Immutable charge amounts, fee and connected-account destination are unchanged.
- [Stripe's expiry API](https://docs.stripe.com/api/checkout/sessions/expire) accepts open sessions and returns an error for non-expirable states. This supports best-effort expiry, not an assumption that an error proves the session is closed.

## Exact Verification

Affected route: `POST /api/payments/checkout`. Related operator path: `PATCH /api/admin/bookings` with an authorized cancellation decision, followed by the existing provider closure/reconciliation logic. Deterministic races exercise the shared Checkout helper directly; the provider is simulated while SQL locks/writes are real.

| Test | Steps | Expected / Actual |
| --- | --- | --- |
| Baseline reproduction | Supply cached buyer context after TRAINER/ADMIN role, deletion or missing user; separately revoke during provider creation | All 6 new assertions failed because baseline returned a payment URL. 67 existing cases were excluded by the focused filter, not counted as passes. |
| Focused unit/route retest | Run `vitest run tests/checkout-attempts.test.ts tests/payments-checkout.test.ts --configLoader runner` | Final expanded run: **99/99 passed in 798ms**. Covers current buyer checks, create/retrieve revocation, provider expiry outage, inconsistent expiry identity/state/recovery, fast webhook precedence, restored-parent safe replacement, and trainer unavailability. |
| Revocation wins SQL lock | Separate client holds buyer row FOR UPDATE; queue Checkout; observe `pg_blocking_pids`; commit role/deactivation change | Both cases denied before payment/attempt writes and provider calls. PASS. |
| Provider response crosses revocation | Commit role/deactivation through an independent client inside simulated create/retrieve response | Four cases passed: returned ID persisted once to payment/attempt; open session expired; URL denied; booking/payment stay PENDING; further revoked retry makes no provider call. Independent write completion proves no buyer lock spans that provider call. |
| Expiry unavailable | Revoke during creation; expiry throws; inspect persisted ID; make authorized cancellation decision; retry existing closure path | Known session remains traceable, no replacement is created, later closure succeeds, payment is not falsely marked refunded/failed. PASS real SQL with provider simulation. |

Focused SQL command: `vitest run --config vitest.postgres.config.ts --configLoader runner tests/integration/postgres-payments.integration.ts -t 'queued checkout|withholds checkout after buyer|uncertain withheld checkout'`. **7 passed / 63 excluded by filter, 2.50 seconds**. Full suite results follow separately.

## Manual Reconciliation

1. With authorized operator access, identify the booking, payment and latest attempt. Use the retained Stripe session/intent IDs and immutable request metadata; do not delete identities, clear payment rows or create a fresh charge merely because a request failed.
2. Inspect current provider session, PaymentIntent, charge, transfer and refund state in the correct Stripe environment/account. A pending local payment or withheld URL does not prove no money moved. This patch does not persist a new automatic reconciliation-queue flag.
3. Decide whether the booking should be cancelled under the existing operating policy. If cancellation is authorized, use the existing admin booking cancellation action with a recorded reason. Repeating cancellation can retry the existing closure path. Do not cancel silently just to make the UI appear clean.
4. Treat `review_required`, paid/processing observations, unresolved intents and provider errors as open reconciliation. Actual refunds or transfer reversals require the separately defined operator policy and verified provider evidence; this patch performs neither.
5. Do not restore a closed account or change a role merely to bypass the guard. If legitimate access is restored through the normal account process, the ordinary Checkout path re-observes the old session before any replacement.

## Limitations And Gates

This protects preparation and finalization of requests reaching these transaction checks. It is not a sweep of every link issued before account revocation, a background expiry worker, an account-closure cancellation policy, or protection against session-version-only changes after initial authentication. Unknown provider creation outcomes still use the existing bounded recovery/manual reconciliation path. Trainer time zones/past-start validation, pending holds, package policy, isolated staging/correct-project deployment and real Stripe Checkout/Connect/transfer/refund/bank-payout evidence remain open. No production-readiness claim is made.

## Full Retest And Publication

- `npm run check` exited 0: lint with existing warnings, typecheck, **796 unit tests / 43 files in 9.74 seconds**, Prisma generation and optimized build (compile 24.3 seconds; 72 static pages generated). Unit run began 17:14:32 UTC.
- Full guarded PostgreSQL suite began 17:16:26 UTC: **223/223 tests across 9 files passed in 34.53 seconds**, exit 0. Expected constraint errors were deliberate rollback probes. Stripe remained simulated.
- Final built-app browser regression: **76/76 passed across 17 files**, exit 0, no retry or timeout relaxation. Chromium via Edge ran one worker/file process at desktop/mobile sizes against the optimized loopback server and real guarded SQL. Output root: `test-results/checkout-revocation-final`. Existing browser Checkout provider responses are simulated; the new deterministic revocation races are tested in unit/real-SQL suites, not against live Stripe.
- Cleanup: stopped Next, verified the exact disposable database/guard and zero users, athletes, athlete/booking requests, bookings, payments, Connect attempts, admin actions and notifications. Removed 32 synthetic rate-limit buckets in a guarded disposable-only transaction and verified zero remaining. PostgreSQL stopped successfully. No production counters/data changed.
- The sandbox Windows account still could not launch processes (error 1909); scoped approved native execution and the same patch helper were used. No OS account/security settings were modified.

## Publication And Live Evidence

- 2026-10-08 17:26 UTC: source/test/report commit [`66973fd7f0f250a9794eb350636421c4ece2eaf3`](https://github.com/StylereTech/trainr/commit/66973fd7f0f250a9794eb350636421c4ece2eaf3) pushed normally to `codex/payment-readiness-20261006`. `git ls-remote` independently confirmed this SHA. Main stayed `2067e743c54ffee669cd484f26dc472b157f1881`; no force push, main promotion or production migration.
- [Hosted CI run 37816579270](https://github.com/StylereTech/trainr/actions/runs/37816579270) failed with **zero executed steps**. Check-run `113446639299` annotation: `The job was not started because your account is locked due to a billing issue.` This confirms an external execution blocker, not a green hosted check or a local test failure.
- Source commit Vercel status remained **pending**, pointing to [the trainr preview](https://vercel.com/styleres-projects/trainr/4gz2GwZyBmdZBHrBXP9nQqUYVMqs). Pending is not evidence of successful deployment, configured staging or verified production behavior.
- Read-only anonymous smoke on `https://trainr.cc`, 17:26:31-17:26:32 UTC local clock: `GET /api/health` returned 200 with `ok:true, dbConnected:true`; `/api/bookings`, `/api/payments/connect`, `/api/trainer/stripe-connect` and `/api/admin/bookings` each returned 401 Unauthorized. PASS only for the sampled health/anonymous boundaries.
- `GET /api/auth/verify` still returned 400 `Verification token required`, consistent with older live behavior rather than the audit branch's anonymous 401. These live GET checks do not prove that this Checkout fix is deployed and do not test a payment or account-revocation race. No live account, session, booking, charge, transfer or payout was created by this pass.
- This publication-only follow-up edits documentation, not the tested runtime. Remaining application/policy work, isolated staging, correct-project rollout, billing-unblocked CI and actual Stripe/email/money-flow proof are still required. Full production and money-flow signoff remain **HOLD**.
