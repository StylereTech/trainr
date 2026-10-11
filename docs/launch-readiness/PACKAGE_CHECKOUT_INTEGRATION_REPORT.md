# Package Checkout And Receipt Verification

## Scope And Identity

- Date: 2026-10-11 UTC. Baseline `45054c1f478f806ce437ab8b8d47cb28d230a2f5`, branch `codex/payment-readiness-20261006`.
- Environment: source and guarded disposable local PostgreSQL 16.15, `trainr_audit_timezone_20261011`, role `trainr_test`, loopback 55439. Synthetic `example.test` parent/trainer fixtures only. Stripe API responses are simulated, not sandbox or live receipts.
- Tested entry points: `startOrResumePackageCheckout`, `reconcilePackageCheckout`, shared destination receipt verification, and signed `POST /api/payments/webhook` invocations in the local integration suite. No real Stripe session, charge, transfer, refund or payout was created.
- The package checkout service remains internal. There is no public package checkout endpoint/button, credit issuance/redemption or parent package history UI. The webhook can reconcile a correctly identified package session, but this is not public package-purchase readiness.
- Overall money-flow and production verdict: **INCOMPLETE / HOLD**.

## Implemented Boundary

`PackageCheckoutAttempt` preserves exact checkout parameters, a per-purchase sequence, provider session identity and retired history. Database constraints allow one active attempt per purchase and prohibit rewriting an attempt's identity/parameters or reopening a retired attempt. The purchase stores separately verified provider IDs and financial-review evidence, without reusing a booking payment or writing a trainer wallet credit.

Preparation validates current parent ownership, purchase amounts, trainer eligibility, the reviewed catalog revision and availability of the snapshot's services/sports, then reads current Connect readiness. External session creation happens outside SQL locks and uses a durable attempt-specific key. Lost responses retry the same parameters/key. An unknown outcome older than the 23-hour recovery window is withheld for reconciliation. An expired unpaid session can be replaced only after any attached PaymentIntent is verified canceled. Account/package/service changes during provider calls withhold the link and retain the returned provider identity; expiry is best-effort, not proof of financial closure. Changed offer terms require a new reviewed purchase request, never silent repricing of the existing immutable purchase.

Package metadata has its own purchase and attempt identity and cannot masquerade as booking metadata. Signed completion events trigger fresh Session, PaymentIntent, captured Charge, destination Transfer, application-fee and dispute-history reads. Successful capture can be recorded once by identity, while refunds/reversals/fee refunds/disputes produce review evidence. Repeated paid events do not undo stored refund status, create bookings, grant credits or pay a second wallet balance. This proves provider-receipt handling with fixtures, not bank payout.

The booking entry point retains its existing identity checks while sharing the provider-receipt verifier. Package callers pass package identity directly, not a fabricated booking.

Stripe documents that [idempotency keys may be removed after 24 hours](https://docs.stripe.com/api/idempotent_requests), which is why unknown aged attempts do not blindly create again. Stripe also requires [server-side fulfillment that tolerates repeated/concurrent calls and does not rely on the success redirect](https://docs.stripe.com/checkout/fulfillment.md?payment-ui=stripe-hosted). These sources explain the design; they are not evidence of a real payment test.

## Tests And Retest Proof

| Steps / Expected Result | Actual Result | Result |
| --- | --- | --- |
| Prepare an owned package checkout; inspect durable params and resume | Distinct package metadata, 6,000-cent gross destination charge, 900-cent fee, identical session on retry | PASS in local SQL fixtures |
| Lose the initial Stripe response, then retry; submit concurrent requests | Same saved parameters/key and provider session; one active attempt | PASS |
| Retry an unknown outcome after recovery-window expiry | No second create; reconciliation required | PASS |
| Disable Connect readiness/transfers or return a different account/provider failure | No checkout attempt created | PASS |
| Submit a foreign buyer or change parent/trainer/account access during provider creation | No payment URL released; returned identity retained on access-change races | PASS |
| Return wrong price/currency/identity, booking metadata, recovered session or untrusted payment URL | Checkout refused, no paid promotion | PASS |
| Expire an unpaid session, including canceled/processing attached intents | Only no-intent or verified-canceled cases replace; unresolved intent blocks replacement | PASS |
| Directly mutate attempt parameters/session ID or insert another active attempt | SQL rejects changes | PASS |
| Deliver valid signed package completion/async-success, including repeats/concurrency | Current receipts verified and purchase provider identity persisted; no booking/Payment/wallet write | PASS |
| Deliver a paid event while current provider state is unpaid or receipts mismatch/fail | Conflict or retryable 503; purchase remains unpaid | PASS |
| Return current refund/reversal/fee-refund evidence | Financial review recorded, no usable credits granted | PASS |
| Omit required package metadata, mix booking/package metadata, use invalid signature or connected-account scope | Invalid/ambiguous events denied; connected-account payment events ignored | PASS |
| Deliver a late event for a retired session or repeat after stored refund | Current attempt and terminal refund state preserved | PASS |

- Initial focused existing unit regressions: **180 passed / 4 files**, 14.98 seconds (`package-checkout-focused-unit.log`). Initial typecheck passed.
- Initial new SQL coverage: **41 passed**, 22.07 seconds (`package-checkout-focused-sql.log`); expanded to 47 cases before the full run.
- First full SQL run: **485 passed, 1 failed / 486**. Refactoring changed the missing-checkout diagnostic from `Immutable checkout destination...` to a generic identity error. The test detected this compatibility regression; financial promotion remained denied. Restored the established source error contract without weakening the assertion. Log: `.postgres-test/package-checkout-full-sql.log`.
- Corrected focused SQL retest: **155 passed / 2 files**, 16.25 seconds at 2026-10-11 20:02:47 UTC, covering all 108 existing settlement/refund cases and all 47 new package cases. Log: `.postgres-test/package-checkout-final-focused-sql.log`.
- Subsequent full SQL rerun: **486 passed**, 105.93 seconds (`package-checkout-final-full-sql.log`). Follow-up source review then identified that package/service withdrawal or a changed catalog revision did not prevent checkout. Three targeted tests reproduced this by incorrectly receiving payment links (`package-checkout-availability-baseline.log`: 3 failed, 47 excluded by the test filter). Added current catalog/service checks before creation and after the provider call, plus two revocation-race cases. Final focused retest: **160 passed**, 20.30 seconds, covering 108 existing and 52 package cases (`package-checkout-release-focused-sql.log`).
- Migration rehearsal: exit 0 on fresh, legacy and phone-history databases, 15 checksums and SQL safeguards verified; schema parity, no-op replay and preservation of historical financial rows passed. All owned rehearsal databases removed. Log: `.postgres-test/package-checkout-migrations.log`.
- Two intermediate quality-gate processes were deliberately stopped when the missing-checkout diagnostic regression and then the stale-offer gap were found. Final full-suite/build/publication evidence follows when complete; do not count interrupted gates as passes.
- Expanded release SQL: **491 passed / 14 files**, 78.71 seconds at 2026-10-11 20:08:23 UTC. Includes all 439 previous cases and 52 package checkout cases. Log: `.postgres-test/package-checkout-release-full-sql.log`. Independent cleanup verified the disposable guard and zero purchases, package attempts, users, bookings, payments, packages and wallet entries; PostgreSQL stopped cleanly (`package-checkout-cleanup.log`).
- The next quality attempt passed lint/typecheck and all 1,327 unit cases but failed during Prisma generation with a Windows engine-DLL rename `EPERM` while the SQL suite was active (`package-checkout-release-check.log`). The sequential retry runs only after the SQL process and database have stopped; the failed build is not counted as green.
- Final sequential `npm run check`: **exit 0**. Lint 0 errors/43 existing warnings, typecheck passed, **1,327 unit tests / 62 files** in 18.98 seconds, Prisma 6.19.3 generation succeeded, Next 16.4.0 compiled in 25.5 seconds and generated 75 static pages. Log: `.postgres-test/package-checkout-verified-check.log`. `git diff --check` passed. No browser E2E suite was rerun for this server-only phase; hosted smoke is reported separately.

## Still Required Before Selling Packages

Implement and verify paid credit issuance, atomic owned-child redemption, parent balance/history and accessible purchase/booking UI, package-specific refunds/disputes/reversals and operations tooling, account-closure implications, and fresh authorization when consuming credits. Handle previously released payment links when an offer is later withdrawn, including captured payments for services that cannot be fulfilled; pre/post-create eligibility checks do not revoke every previously shared Stripe URL. Decide expiry start and cancellation/credit-restoration policy; both owner questions remain unanswered as of this report.

Current package receipt verification on completion is not continuous package financial-event/refund reconciliation. Existing refund/financial-event handlers still target booking payments. Complete package handling before exposing checkout or making credits usable; do not infer refund readiness from booking tests. A recorded `SUCCEEDED` package capture alone must never grant redeemable access or claim bank payout.

Actual hosted trainer login, Connect onboarding, real sandbox checkout, callback/webhook delivery, customer refresh, trainer transfer and bank-payout proof remain unverified. The browser remained a PARENT session during this pass. No production promotion or main-branch change is authorized by these fixture results.
