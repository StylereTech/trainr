# Connect Readiness Ordering

## Identity And Scope

- Date: 2026-10-11 UTC, investigation after 10:27 UTC; local gate retest at 10:38 UTC.
- Baseline: `50c559bf80b85c5daa5a5b68d50dd7626f38cce4`, branch `codex/payment-readiness-20261006`; initial worktree clean.
- Publication target: audit Preview project `trainr` and its existing branch alias only. Main, Production `trainr-node`, Story, email/Replit, environment credentials and database schema are unchanged.
- Local environment: Windows, disposable PostgreSQL 16.15 database `trainr_audit_timezone_20261011`, loopback port 55439, synthetic `@example.test` users. Stripe reads are simulated in unit/SQL/browser fixtures; no local test is an actual provider transaction.
- Routes: `/api/payments/webhook`, `/api/payments/checkout`, canonical `/api/payments/connect`, legacy `/api/trainer/stripe-connect`, `/trainer/dashboard`, `/trainer/profile?tab=payouts`, `/book/[slug]`, `/parent/dashboard`.

## Fresh Hosted Prerequisites

Existing owner-authenticated PARENT session remains signed in. Parent dashboard shows one saved Sandbox Athlete and zero bookings/reviews. No password was collected and no session was switched.

Read-only Neon Query UI on resource `trainr-audit-staging-20261009`, project `steep-field-81581985`, store `store_XfqL8TP23Pm8rabk`, database `neondb`: vertical UNION ALL aggregate result, 774ms, explicitly showed all nine counts below. The earlier wide result was partially virtualized and is not relied upon for hidden columns.

| Category | Actual count |
| --- | --- |
| Active parents | 1 |
| Active trainers | 0 |
| Active admins | 0 |
| Profiles linked to Connect | 0 |
| Cached Connect-ready profiles | 0 |
| Service offerings | 0 |
| Packages | 0 |
| Bookings | 0 |
| Payments | 0 |

Steps: select the existing isolated storage Query view with read-only enabled; count non-deleted users by role, profiles with non-null `stripeAccountId`, profiles with `stripeOnboardingComplete=true`, and all rows in service_offerings/packages/bookings/payments. Expected: determine prerequisites without modifying records. Actual: table above, PASS for observation, NOT a flow pass.

Stripe sandbox `acct_1RAkm8PvdPuIlEw5`, `/test/connect/accounts`: loaded UI explicitly showed All 0, Enabled 0, Restricted 0 and No connected accounts. An initial navigation timeout was followed by observation of the same tab, not treated as a failed provider flow. No live account, new Connect identity, checkout, payout or credential change was used. The previously observed standalone CLI payment is not a TRAINR booking/destination receipt.

Owner action requested: complete a separate trainer signup with their password and terms acceptance. Pending response; the existing parent session remains intact. Hosted trainer setup, approved catalog, actual sandbox booking, destination transfer and payout proof remain blocked by missing prerequisites, not marked working.

## Finding And Fix

P2: `account.updated` persisted its event snapshot directly, while checkout and trainer status independently fetched and persisted readiness. A delayed event or concurrent older response could replace newer cached readiness. Parent Pay now visibility uses that cache. Checkout already reread Stripe; no unauthorized charge was reproduced or claimed.

All three readiness refresh paths now call `refreshConnectReadiness`. It locks matching profile rows in deterministic order before retrieving the current Stripe account, checks returned identity, and updates readiness within the same bounded transaction. The provider read has a 4s timeout and zero SDK retries; transaction max wait is 5s and timeout 10s. Unknown account IDs do not trigger a provider call. Failed/mismatched reads roll back and webhook processing returns retryable failure, never falling back to the event snapshot. Deleted provider identities clear readiness but retain the saved identity. Current user/account/session checks remain in trainer access and Checkout settlement paths.

This serializes local readiness writes, not external Stripe changes. A provider account may change after any successful read. Checkout still applies its independent current-attempt and destination safeguards. This introduces no charge/refund/transfer/payout operation and no new account creation path.

Stripe documents non-guaranteed webhook event order and current-resource retrieval ([webhooks](https://docs.stripe.com/webhooks), [retrieve account](https://docs.stripe.com/api/accounts/retrieve)), checked 2026-10-11. Existing signature and event-scope validation remains in force.

## Test Evidence

| Steps | Expected | Actual |
| --- | --- | --- |
| Add opposite-snapshot/current-provider regressions before implementation | Reproduce snapshot persistence | FAIL as expected: 4 failed, 12 passed; exit 1 |
| Focused signature-scope and checkout tests after fix | Current provider truth, no unknown-account update, failure retry, no checkout for unlinked identity | PASS: 37 tests / 2 files, exit 0 |
| Focused real PostgreSQL Connect suite | Serialized reads, account replacement during lock wait, rollback/retry, deleted identity preservation, existing authorization | PASS: 26 tests / 1 file, 9.58s, exit 0 |
| First full lint/type/unit/build gate | Existing suite compatibility | FAIL: 1,237 passed, 2 failed; old payment-readiness fixture lacked transaction trainer methods and current provider response; build not run |
| Correct fixture without removing safety assertions, rerun three focused files | Real helper receives equivalent simulated provider/DB interfaces | PASS: 49 tests / 3 files, 3.72s, exit 0 |
| Full SQL regression | Shared money/auth/booking persistence remains valid | PASS: 373 tests / 11 files, 70.40s, exit 0 |
| Final full check | Lint, types, units and optimized build | PASS: 1,239 units / 58 files, 75 generated pages, compile 59s, exit 0; existing lint/Browserslist warnings remain |
| Desktop/mobile Connect, payout and checkout recovery | Safe status, errors, links and persistence | PASS on complete rerun: 36/36, 7.3m, exit 0, no retries/skips; initial failures and focused retest recorded below |
| Preview deployment and hosted smoke | Exact source Ready, parent state and role/signature boundaries preserved | PASS: source `428feda`, Ready audit Preview, five anonymous denials and authenticated parent refresh/history/trainer-page denial; actual provider onboarding remains unverified |

The focused fixture retest and first corrected full check initially could not resolve Vitest configuration because the Windows filesystem sandbox denied directory access; no tests ran on those attempts. Escalated local-test execution passed the focused suite and is used for the final full gate. These environment failures are not hidden as test passes.

Commands: `npx vitest run tests/payment-readiness.test.ts tests/stripe-webhook-scopes.test.ts tests/payments-checkout.test.ts`; guarded `npm run test:postgres`; `npm run check`. Evidence logs under `.postgres-test/`: `connect-readiness-baseline.log`, `connect-readiness-focused.log`, `connect-readiness-focused-sql.log`, `connect-readiness-check.log`, `connect-readiness-fixture-retest-escalated.log`, `connect-readiness-full-sql.log`, `connect-readiness-check-final.log`.

Browser command: `node node_modules/@playwright/test/cli.js test e2e/connect-local-regression.spec.ts e2e/payouts-local-regression.spec.ts e2e/checkout-recovery-local-regression.spec.ts --project=chromium --workers=1 --reporter=list`. Installed Chrome, loopback optimized app on port 3107, guarded local synthetic auth/SQL fixtures. The first run used the repository's 30s total test budget: 34 passed, 2 failed in 10.1m, exit 1. Both failures were the desktop deliberately stalled-checkout cases, each exceeding that budget; one also reported a teardown foreign-key failure. Independent psql readback after terminal completion verified the disposable marker and zero users/bookings/sports; no manual deletion was needed. System diagnostics during the slow run reported 759,524 KiB free of 15,667,100 KiB physical memory; this is context, not proof of the sole cause.

Focused retest used `--grep '1440px.*recovers timeout' --timeout=60000`: 2 passed in 1.3m, exit 0, individual durations 31.5s and 34.7s. The application timeout remains 15s and assertion timeouts are unchanged; only the command's overall test budget increased. No app/test source was altered to obtain those passes. The full 36-case rerun uses the same 60s total budget. Logs: `.postgres-test/connect-readiness-browser.log`, `connect-readiness-browser-focused-retest.log`, `connect-readiness-browser-final.log`. Original failure traces remain under `test-results/connect-readiness/`.

Scope of browser evidence: status/wallet provider responses and checkout URLs are intercepted; real local HTTP/SQL handles unlinked status, reservation creation, account access and booking reload. These tests verify UI recovery, allowed destinations, no duplicate reservation and no false Paid status. They do not contact actual Stripe or exercise a hosted trainer. Visually inspected [desktop payout panel](evidence/connect-ordering-20261011/desktop-payouts.png) and [mobile payout panel](evidence/connect-ordering-20261011/mobile-payouts.png), both with explicitly synthetic balances/payouts: content is legible without horizontal overflow. The mobile dashboard's transient redirect-error toast covers some header text in the separate status screenshot; no site-wide visual perfection is claimed.

Additional pre-publication hosted observation on the baseline alias: clicked Find Trainers from the parent dashboard, cleared the persisted Texas state filter, waited for the unfiltered catalog to settle at zero trainers and No trainers found, then returned to the parent dashboard. PASS for navigation/reset/empty state only, not trainer selection or booking.

Final browser rerun: all 36 cases passed in 7.3m with `--timeout=60000`, exit 0, no skipped cases or automatic retries. Independent final psql readback matched the disposable database/guard marker and returned zero users, bookings, payments, sports and service offerings. The owned Next process stopped with expected Ctrl-C exit 1; owned PostgreSQL stopped cleanly, exit 0. No hosted records were removed.

## Publication And Hosted Retest

- Committed/pushed source `428feda18cf8e34577e4b82cbc02401589bf8840` to `codex/payment-readiness-20261006`; local HEAD matched remote-tracking SHA and worktree was clean before this documentation follow-up.
- Vercel Preview project `trainr`, deployment [`EDqytJcuwdGjfdWmXmRVZvZZaPRk`](https://vercel.com/styleres-projects/trainr/EDqytJcuwdGjfdWmXmRVZvZZaPRk), Ready 2026-10-11 11:05:05 UTC. Exact source and stable branch alias were visibly confirmed. Unique host `trainr-joidx8vsv-styleres-projects.vercel.app`. Transient browser inspection timeouts were resolved by reading the same tab's accessibility state; no new deployment or credentials were needed.
- Hosted checks at 11:07:14 UTC used `https://trainr-git-codex-payment-readiness-20261006-styleres-projects.vercel.app`. Anonymous GET `/api/payments/connect`, GET `/api/trainer/stripe-connect`, POST `/api/payments/connect` and POST `/api/payments/checkout` each returned 401 `{"error":"Unauthorized"}`. POST `/api/payments/webhook` without a signature returned 400 `{"error":"Missing stripe-signature header"}`. POST bodies were `{}`; no cookies, secrets, actual account/booking identities or payment details were sent. Five checks passed, command exit 0. These prove rejection boundaries, not authenticated provider refresh.
- Existing owner-authenticated PARENT browser: reloaded `/parent/dashboard` and waited for persisted content; one Sandbox Athlete, zero open bookings/reviews and no upcoming sessions, PASS. Navigated `/trainer/dashboard` and was redirected to `/parent/dashboard`, PASS for the parent/trainer page boundary. Clicked Past (0), saw No past sessions yet, PASS. No sign-out, new account, hosted financial mutation, credential change or role grant.
- The following documentation commit is separately checked for Preview readiness after push. This report identifies the verified application source above rather than inventing its own containing commit hash. Actual hosted `account.updated` handling, trainer Connect refresh, paid Checkout, destination transfer and payout are still unverified because the required trainer/account/catalog/booking do not exist. Main/Production/Story remain unchanged.

## Remaining Gates

**HOLD:** no hosted trainer or connected account yet, no actual TRAINR sandbox payment/destination receipt/payout. Trainer signup/onboarding, catalog approval, programs/credit redemption, unpaid hold expiry policy/implementation, unattended recovery and remaining release gates stay open. This is a scoped Connect ordering fix, not production or money-flow signoff.
