# Destination Settlement Verification

2026-10-08 post-settlement update: platform transfer, application-fee and dispute lifecycle events now resolve current provider relationships and invoke full settlement verification. Current dispute history and sanitized financial observations drive replay-safe party/active-admin review notices, including after full customer refunds. No money movement or automatic dispute resolution is performed. Baseline `5cfc90fdb0b5da5e6f13f77f678bb1c9f15764c5`; [reproduced failures, tests, required webhook subscriptions and publication proof](POST_SETTLEMENT_EVENT_REPORT.md). Provider reads are simulated locally; production rollout and real money-flow proof remain HOLD.

## Scope And Verdict

- Date/time: 2026-10-08, focused checks at 17:41-17:46 UTC; final gate/publication observations below.
- Environment: Windows/Node 22, local disposable PostgreSQL `trainr_audit_20261008` on loopback port 55439; synthetic Stripe objects only. No real charge, transfer, application fee, refund or bank payout was created.
- Baseline commit: `23e5995ed1602b2cd2c5199b36c1872e615c4619`; tested source published as `763b675821cb84ca0eefbfe7ac1139b53651333d`.
- Branch: `codex/payment-readiness-20261006`. No main promotion or production migration.
- Accounts: per-test synthetic UUID `*-parent@example.test` and `*-trainer@example.test` accounts; `acct_settlement` is a fake provider destination. No live customer accounts or demo credentials used.
- Routes: signed `POST /api/payments/webhook`; the shared paid-recovery path used by `POST /api/payments/checkout` and cancelled-checkout recovery. SQL tests call the real webhook handler and shared checkout service, not a running external Stripe endpoint.
- Local fix status: implemented; focused checks passed. Production readiness and full money-flow signoff remain **HOLD** pending live provider/staging proof and other launch gates.

## Finding And Change

At baseline, success events checked payment identity, gross amount and currency, but did not read Stripe's destination, captured charge, transfer or application-fee receipt. A signed event's metadata and amount could therefore confirm a booking without proving the trainer received the intended allocation. `stripeTransferId` was not populated by this path. Paid and failed PaymentIntent/Checkout events also lacked the connected-account context guard already used for refund events.

The shared paid-evidence path now requires a valid, unretired immutable CheckoutAttempt with matching booking/payment/attempt metadata, USD gross amount, platform fee and trainer share. It reads the platform PaymentIntent, captured Charge, Transfer and (for nonzero fees) ApplicationFee under the existing booking/payment locks. Each call has a four-second timeout and no SDK retries; the SQL transaction has a 25-second bound. Mismatches roll back with a conflict; missing receipts and provider failures remain retryable and cannot confirm the booking.

The destination-charge model transfers the gross charge, then returns the application fee to the platform. A net-sized transfer plus that fee would be the wrong split. The fee's platform charge identity is `originating_transaction`; its `charge` must match the transfer's destination payment. See [Stripe destination-charge flow](https://docs.stripe.com/connect/destination-charges?platform=web&ui=stripe-hosted), [transfer fields](https://docs.stripe.com/api/transfers/object), and [application-fee fields](https://docs.stripe.com/api/application_fees/object). These documented semantics informed validation; synthetic fixtures are not proof of actual account configuration.

Verified charge and transfer IDs are saved atomically with settlement and notification state. Zero-fee checkouts do not invent an application-fee receipt. The saved destination is authoritative even if the trainer later changes their current account. Connected-account payment events are ignored; they cannot credit a platform booking by metadata alone.

Refunded/disputed charges, reversed transfers and refunded fees cannot trigger a new booking confirmation. Both parties receive a review notice, including once when such activity is first observed on a later success replay. Previously confirmed booking history is not automatically rewritten for a dispute/reversal. Current refund reconciliation runs after verified identities commit, so an early refund can find the payment. If that read fails, the webhook returns a retryable error, retained IDs make retry possible, and the booking remains unconfirmed. Existing full/partial refund precedence and cancelled/rescheduled booking decisions are preserved.

## Reproduction And Retest Matrix

| Exact steps | Expected | Actual / verdict |
| --- | --- | --- |
| Seed pending booking/payment and saved attempt; sign Checkout completed, async succeeded and PaymentIntent succeeded payloads; replay each. | Retrieve all receipts; persist charge/transfer; confirm once. | PASS: real signature + real SQL suite verifies one confirmation and two notices. |
| Send simultaneous paid deliveries against the same booking. | Serialized writes with one fulfillment. | PASS: real row locks, two notices total. |
| Keep gross/metadata correct but change intent destination/fee, capture flag/amount, transfer destination/source/gross, or fee source/amount. | Conflict, no financial mutation or confirmation. | PASS: signed route returns 409; independent SQL reads show PENDING and null intent/charge/transfer IDs. |
| Omit transfer or fee receipt, or throw provider transport failure; restore valid receipt and replay. | Retryable failure then one successful fulfillment. | PASS: 503 without private provider diagnostics, then 200 and CONFIRMED. |
| Sign connected-account payment success/failure events containing valid TRAINR metadata. | Ignore without provider crediting or payment mutation. | PASS: 200, no PaymentIntent read, unchanged pending payment. |
| Remove saved attempt from a legacy paid session. | Do not infer historical destination from current trainer account. | PASS: 409 before provider reads; payment remains pending. |
| Change trainer's current account after saving checkout; return receipts matching the saved account. | Honor original immutable destination. | PASS: saved transfer recorded. |
| Recover an already-paid Checkout session with valid versus incorrect transfer destination. | Both paths invoke verifier; no new checkout URL. | PASS: valid path settles then reports already processing; mismatch stays pending. |
| Deliver payment after CANCELLED/RESCHEDULED. | Record genuine settlement without reopening. | PASS: terminal decision retained; review notices only. |
| Return dispute, transfer reversal or application-fee refund; replay. | No new booking confirmation; review notices do not duplicate. | PASS: pending booking, two review notices. |
| Settle cleanly, then observe reversal on a later paid replay. | Warn once without rewriting confirmed history. | PASS: two original notices plus two review notices after repeated replay. |
| First paid event already has a 1,000-cent or 6,000-cent refund; reconcile actual per-refund mock receipts and replay. | Partial/full refund persistence, no transient booking confirmation. | PASS: PARTIALLY_REFUNDED/PENDING or REFUNDED/CANCELLED; no BOOKING_CONFIRMED notice. |
| Fail the early refund-list read after identity commit, then replay with a successful full refund. | Keep IDs and no confirmation; retry can finish refund reconciliation. | PASS: first 503, then 200 and REFUNDED/CANCELLED. |
| Add a synthetic-only SQL CHECK constraint rejecting this booking's notification after receipt verification; clear saved session IDs; deliver paid event. Remove constraint and replay. | Roll back attempt session, payment identities and confirmation; clean retry succeeds. | PASS: first 503 with all identities null/PENDING; second 200 and verified transfer/CONFIRMED. Constraint removed in finally. |

Unit tests additionally cover expanded provider IDs, zero fee, wrong currency/mode, invalid refund/reversal amounts, malformed saved parameters, missing identities and every bounded provider failure point. Existing ordering/checkout/readiness and refund integration suites explicitly stub settlement verification to isolate their original state-machine responsibilities. They are not settlement-provider evidence; the new `stripe-settlement` unit and SQL suites invoke the real verifier.

## Local Evidence

- Focused unit/signature/checkout run: 216 tests in five files, PASS, 1.83 seconds, 17:41:25 UTC.
- Initial new SQL suite: 33 tests, PASS, 2.61 seconds, 17:43:35 UTC.
- Broader SQL run after adding later-reversal review: 257 tests in ten files, PASS, 39.62 seconds, 17:44:46 UTC.
- Focused SQL retest including real notification rollback: 35 tests, PASS, 2.80 seconds, 17:45:55 UTC.
- Full `npm run check`: PASS (lint, typecheck, 878 unit tests and production build); unit portion took 12.62 seconds at 17:46:27 UTC. Build compiled in 27.1 seconds and generated 72 pages. Existing lint warnings and Browserslist age warning remain; no new lint errors.
- Environment failure: sandboxed PostgreSQL startup failed with restricted-token error 87. Scoped native startup of the same loopback-only disposable instance succeeded; no OS security settings changed. This was not a product failure.
- Expected negative-test logs include `Stripe webhook persistence failed` and synthetic SQL constraint failures. They are assertions of rollback/retry behavior, not unexplained successful-run errors.

## Operator And Release Requirements

1. Keep production HOLD. Before deployment, verify full migration history, isolated staging configuration and the correct Vercel project. This change adds no migration; prior audit migrations still require approved rollout.
2. With a correctly onboarded test trainer, complete a Stripe-hosted test Checkout, then inspect/replay its signed platform events and independently retrieve the PaymentIntent, captured Charge, Transfer and ApplicationFee. Verify the destination, gross, fee, destination payment, currency and test/live context against the saved attempt. Verify booking/payment state after a fresh browser reload. Retain redacted receipt IDs and timestamps.
3. Test refund-before-success, delayed transfer/fee availability, cancelled checkout, signature mismatch and webhook redelivery with actual provider objects. Four sequential reads hold booking/payment locks for a bounded interval; measure provider latency and retry contention in staging before promotion.
4. A 409 settlement conflict or missing historical attempt requires reconciliation. Inspect the original Checkout request and provider receipts. Do not manufacture an attempt from the trainer's current account, delete payment IDs, mark paid manually, create a replacement checkout or issue another transfer without proving the original outcome. There is no automatic legacy-destination backfill in this change.
5. A 503 means missing/unavailable provider evidence or persistence failure, not proof that a customer was not charged. Retry the same event after recovery; do not charge again. Early refund-read failure can leave a verified captured payment and review notice while refund reconciliation is pending.
6. A verified transfer proves movement into the connected Stripe account, not available balance or bank receipt. Continue the existing Stripe-managed payout path and independently verify connected-account balance/payout status. Do not credit a second internal wallet or withdraw the gross transfer again.
7. New disputes/reversals after settlement still need dedicated lifecycle monitoring or an operator refresh; observing a later paid replay is not a subscription to those events. Fee/transfer refund differences, cross-border/FX configurations and legacy mapping remain operator review cases. The current verifier intentionally supports the saved USD application-fee model, not arbitrary Stripe charge models.

## Final Gates And Publication

- Final full SQL rerun: PASS, 258 tests in ten files, 36.65 seconds, started 17:56 UTC. The 35-case settlement file uses the real verifier, SDK signatures, SQL transactions and refund reconciler with simulated provider reads.
- Final full unit rerun after test-file organization: PASS, 878 tests in 44 files, 11.15 seconds, 17:57:14 UTC.
- Local production-server Playwright regression: PASS, 76 tests in all 17 files, single-worker Edge, desktop/mobile viewports. `FILES_RUN=17`, `FAILED_FILES=`. Screenshots retained locally under `test-results/settlement-20261008/`. Trainer Connect unverified-state screenshots at 390px and 1440px were visually inspected: readable status/action layout without overlap. No new UI design was introduced.
- Browser fixtures simulate provider responses; they do not establish Stripe-hosted payment or bank payout success.
- Cleanup verified with independent SQL: zero users, bookings, payments, checkout attempts, refunds, notifications, audit rows, athlete profiles/requests, booking requests and Connect attempts. Removed 24 synthetic rate-limit buckets only after checking the disposable database marker and empty user table; verified zero remaining buckets and no temporary failure constraint. Local Next server and PostgreSQL stopped.
- No production readiness or live money-flow claim is made here.

## Publication And Live Observation

- Source fix committed and pushed: [`763b675821cb84ca0eefbfe7ac1139b53651333d`](https://github.com/StylereTech/trainr/commit/763b675821cb84ca0eefbfe7ac1139b53651333d). Remote audit ref independently verified with `git ls-remote`; `main` remains `2067e743c54ffee669cd484f26dc472b157f1881`. This addendum is a documentation-only follow-up to the tested source tree.
- [GitHub Actions run 37820709488](https://github.com/StylereTech/trainr/actions/runs/37820709488): completed/failure; check/job `113460713792` executed **zero steps**. Annotation: `The job was not started because your account is locked due to a billing issue.` External hosted-CI blocker, not a successful or failed execution of the repo tests. Owner billing resolution and a real hosted run remain required.
- Source commit Vercel status: pending, description `Vercel is deploying your app`; [deployment observation](https://vercel.com/styleres-projects/trainr/CqLZgpPLCVxE2aJARPqkGozP6CiB). No completed deployment or production alias promotion was verified. The prior project/environment mapping hold remains in `DEPLOYMENT_CONFIGURATION_REPORT.md`.
- Anonymous live GET smoke at **2026-10-08 18:00:15-18:00:16 UTC** (local observation clock), no account and no writes:

| Route | Expected scope | Actual | Verdict |
| --- | --- | --- | --- |
| `https://trainr.cc/api/health` | Reachable app/database | 200, `ok:true`, `dbConnected:true` | PASS for this narrow health check only |
| `/api/bookings` | Anonymous denied | 401, Unauthorized | PASS |
| `/api/payments/connect` | Anonymous denied | 401, Unauthorized | PASS |
| `/api/trainer/stripe-connect` | Anonymous denied | 401, Unauthorized | PASS |
| `/api/admin/bookings` | Anonymous denied | 401, Unauthorized | PASS |
| `/api/auth/verify` | Audit code availability comparison | 400, Verification token required; audit branch requires authenticated verification | Audit deployment NOT verified; behavior remains consistent with older live code |

No live paid booking, receipt chain, Connect onboarding, database migration, payout or authenticated parent/trainer flow was exercised during this smoke check. Final product readiness remains HOLD. Next money-flow work includes dedicated post-settlement dispute/reversal monitoring and actual staging/provider receipt validation; the new verifier alone is not full production signoff.
