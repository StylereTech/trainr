# Booking Financial Hold Report

## Scope

- Date: 2026-10-12 UTC; workstation local dates 2026-10-11 through 2026-10-12 PDT.
- Baseline: `721c8364b44c0721b3c42024f394b2c9a9b020db`, branch `codex/payment-readiness-20261006`.
- Database: owned disposable `trainr_audit_timezone_20261011`, `127.0.0.1:55439`, guarded `trainr_test` account; separately tagged migration rehearsal databases.
- Hosted target after publication: existing isolated audit Preview only. Main, Production, Story, credentials and real money excluded.
- Accounts: generated `example.test` parent/trainer/admin fixtures. Hosted browser is the existing PARENT session, not a verified trainer session.
- Surfaces: `POST /api/payments/webhook`, admin payment/refund reconciliation, `PATCH /api/bookings/[id]`, `PATCH /api/admin/bookings`, dashboard/list APIs and parent/trainer/admin booking pages.
- SQL/provider tests use real transactions and signed synthetic webhooks with simulated Stripe receipts. They do not prove actual Stripe checkout, transfer or bank payout.

## Reproduced Defect

Severity: **P1, financial-state integrity**. A successful payment label must not authorize session progression while verified provider evidence requires review. Fix status: implemented; publication/retest tracked below.

Created a $60 pending booking and valid immutable checkout receipt, then simulated a dispute, transfer reversal or application-fee refund. The webhook withheld confirmation but still recorded `SUCCEEDED`. Removed the synthetic review notifications and attempted Confirm, Complete or No-show as the administrator (server clock moved after the saved session for outcome tests).

Expected: all nine actions rejected, no booking/statistics/notification/audit mutation. Actual baseline: all nine actions succeeded. **Nine failed / 120 skipped**, 10.38 seconds, start 06:39:16 UTC, exit 1; `.postgres-test/payment-hold-baseline.log`. No constraints/triggers were disabled to reproduce this.

## Implementation

Additive migration `20261012070000_add_booking_payment_review` adds nullable `settlementVerifiedAt` and `financialReview` to Payment. It does not backfill success labels as verified, change existing statuses, move money or rewrite booking history. It is allowlisted only behind the existing exact audit-Preview/branch/database ownership/sandbox-key guards.

Both paid-event settlement and refund reconciliation persist their current verified destination receipt time and review state under booking/payment locks. Failed provider reads roll back and retain the prior hold. A fully verified clean current receipt may clear the stored review; reading/removing a notification cannot. Dispute history, including closed/won entries, continues to require review under the existing conservative verifier. No blanket admin override or automatic money adjustment was added.

Manual Confirm, Complete and No-show now reject financial review, completed/pending/failed refund evidence and unverified positive-value success records. Cancellation remains available without clearing the hold or issuing a refund. Intentional zero-due reservations remain usable without an invented Stripe receipt. Actor/participant and session-time checks remain in force.

Parent/trainer dashboard and booking-list responses expose only a boolean review indicator and verification timestamp, not the new stored receipt details. Admin retains the authorized review data. Trainer/admin action controls use the same hold rules as the server. Parent, trainer and admin pages show the reconciliation/verification state, and the parent no longer receives the green Paid label for held/unverified success. A successful status alone is not presented as bank-payout evidence.

## Verification

| Steps | Expected | Result |
| --- | --- | --- |
| Nine disputed/reversed/fee-refunded action cases after deleting notices | 409, original booking state, no notices | PASS, focused and full SQL |
| Read held booking as parent and trainer | Boolean hold and time, no private review charge ID | PASS, SQL |
| Refund refresh sees dispute/reversal/fee refund | Persist hold; manual confirmation denied | PASS, SQL |
| Provider read fails after prior hold | Original payment/review/time unchanged | PASS, SQL |
| Synthetic clean receipt follows prior hold | Only fresh verified receipt clears hold and may confirm | PASS, SQL; not proof that a real reversal can be undone |
| Legacy SUCCEEDED row with null verification | Manual action denied until existing Stripe receipt verifies | PASS, SQL |
| Zero-due reservation, refund issues, invalid/missing verification time | No invented provider requirement for zero due; unsafe positive states held | PASS, final unit gate |
| Cancel while financial review exists | Preserve all payment/review fields; operator reconciliation notice | PASS, final unit gate |

- Focused SQL: **265 passed / three files**, 76.31s, 06:43:39 UTC; `.postgres-test/payment-hold-focused-sql.log`.
- Initial full units: **1,383 passed / one failed**, 37.14s, 06:43:48 UTC; `.postgres-test/payment-hold-units.log`. The failure was the exact migration-count assertion (16 versus the new 17). Updated the count/title; did not relax checksum/ownership guards. Fresh full gate required.
- Full SQL: **627 passed / 14 files**, 160.21s, 06:46:03 UTC, exit 0; `.postgres-test/payment-hold-full-sql.log`.
- Migration rehearsals: fresh, legacy and phone-history modes all passed; 17 checksums/completion records, schema parity, no-op replay, all 12 historical tables preserved, new legacy review/verification fields null, and all three owned databases removed. `.postgres-test/payment-hold-migrations.log`, exit 0.
- The migration's working-file and staged Git SHA-256 both equal `86f465ef3b425467fa051b18d4df5be50a14337843a44b822509d0524dce0096`; no Windows line-ending mutation is being published.
- Independent SQL guard inspection confirmed zero users, bookings, payments, package purchases and wallet entries after integration tests; owned PostgreSQL stopped before the build.
- Final `npm run check`: PASS, exit 0; lint zero errors / 42 warnings, route type generation and TypeScript passed, **1,401 unit tests / 64 files** passed in 18.80s (06:50:02 UTC), Prisma generation and optimized Next build passed (compilation 39.1s). `.postgres-test/payment-hold-check.log`. The later booking-list redaction edit also passed focused ESLint and was included in this build.
- First compiled browser run: **77 passed / three failed**, 13.4 minutes, exit 1; `.postgres-test/payment-hold-browser.log`. The first trainer future-session case reached the expected rejection UI but exhausted the overall 30-second deadline. Both missing-receipt recovery cases instead reached `Stripe is not configured`: the audit server was started without the synthetic Stripe key required by that existing test. Restarted only the loopback app with a nonfunctional synthetic key; the no-attempt guard returns before any provider call. No real key was read or changed, and assertions were not weakened.
- All 12 new hold cases passed that first run. One parent mobile screenshot omitted warning/service text despite successful visibility checks, so strengthened the test with viewport/bounds assertions and required a fresh full rerun plus visual inspection. Original artifacts retained locally at `.postgres-test/payment-hold-first-browser-artifacts`.
- A separately launched focused lint process stalled and was stopped only after verifying its exact command/PID; the elevated focused rerun passed. Compiled browser retest and deployment results are pending at this draft. Unexecuted gates are not passes.
- Corrected full browser rerun: **80 passed**, 8.6 minutes, exit 0; `.postgres-test/payment-hold-browser-retest.log`. Includes 20 booking outcomes, 24 checkout recovery, eight dashboard persistence/error states, 12 financial holds, ten payment recovery and six refund UI cases at 1440px/390px. The previously timed-out case passed unchanged in 10.4s; both missing-receipt cases reached and passed their intended guard. API writes, role checks, reload persistence, no unintended payment/audit/statistics mutation, redaction and horizontal overflow checks passed. One trainer viewport capture still omitted text, so a separate focused pass adds full-page and warning-level screenshots plus recorded geometry; no CSS/product change is claimed from that observation alone.
- Final focused visual pass: **12 passed**, 1.4 minutes, exit 0; `.postgres-test/payment-hold-visual-retest.log`. Full-page screenshots for parent/trainer/admin at both widths were visually inspected and show readable warnings without overlap; the trainer warning-level capture also contains the complete text. Reviewed images: `evidence/payment-hold/{parent,trainer,admin}-{desktop,mobile}.png`. Earlier inconsistent viewport captures remain recorded above; no unproven product fix is attributed to them. Final focused ESLint passed after the screenshot changes.
- Final independent SQL inspection again confirmed the exact disposable guard and zero users/bookings/payments/package purchases/wallet entries. Owned loopback app and PostgreSQL stopped. Publication and hosted retest remain pending until the source is pushed and deployed.

## Remaining Gates

An actual hosted trainer account, Connect onboarding, customer sandbox payment, webhook receipt, trainer destination transfer and bank payout still need verification. Shared-family credits/redemption/public buying remain incomplete; owner policy answers are still needed for expiry/restoration. Existing Checkout links on account closure, refund notifications to closed accounts, and an audited operator disposition for historical/closed disputes remain separate work. The new hold deliberately does not bypass these conditions to make controls appear usable. Email remains deferred; GitHub billing and other dependency/security findings remain open. Overall production and money-flow status: **HOLD**.
