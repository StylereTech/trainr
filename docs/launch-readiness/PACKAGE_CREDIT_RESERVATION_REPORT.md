# Package Credit Reservation Verification

## Scope

- Date: 2026-10-13 UTC; baseline `255e842cf6061754427089811ee92bc5de94053a`, isolated branch `codex/payment-readiness-20261006`.
- Local environment: guarded disposable database `trainr_audit_timezone_20261011`, role `trainr_test`, loopback port 55439. Synthetic accounts and explicit SQL payment receipts only. No actual Stripe payment is implied.
- Changed surfaces: GET/POST `/api/bookings/credits`, `/parent/packages/<purchaseId>/book`, purchase-history navigation, and shared scheduling checks used by cash reservation creation.
- Main, Production, Story, Replit, provider credentials, real funds and account agreements are excluded. Package sale/Checkout creation is not enabled by this change.

## Implementation

The parent can open an owned package purchase, see currently available per-service credits, choose an eligible child, date and trainer-zone time, and submit a credit-funded reservation. Financial review, unverified/mismatched payment receipts, refunds, expiry, retired/changed service terms and account eligibility prevent new spending. Recorded grants are not treated as a spendable balance by themselves.

The server locks participant accounts in stable order, then parent/trainer/purchase before service, child and booking. Availability, time-zone resolution, athlete overlap and group capacity use the same helper as cash reservations. Booking creation, guarded credit redemption, participant notifications and a parent-scoped idempotency record commit together. No cash price/coupon input, booking payment, Stripe checkout, wallet entry or new trainer payout is created. Current cash prices do not reprice previously paid session credits.

The credit request hash has an explicit funding discriminator. Changed payloads or attempts to reuse a cash request identity conflict. Exact retries return current saved booking state, including cancellation, without reserving or spending again. Deleted saved identities do not create replacement bookings. Uncertain browser responses freeze editing and retry the same in-memory request. Purchase/booking state persists in SQL; a full browser reload does not retain the form's in-memory request and instead starts from current server state/dashboard.

Parent-owned option reads use RepeatableRead and expose bounded safe fields, never raw purchase/provider records. Mutation checks re-read locked records and database time; they do not trust the displayed balance. The existing conservative session-start-before-expiry guard remains unchanged pending the owner's expiry interpretation. Retired/replaced service handling still requires a product decision; new reservations fail closed, rather than silently substituting a different service.

## Initial Verification

1. Initial TypeScript check after the reservation endpoint passed.
2. The first integration run failed before assertions: **172 skipped**, local database unreachable on 55439. The owned cluster had been started on default 5432. Restricted `pg_ctl status` incorrectly appeared stopped due process visibility; the attempted foreground launch refused the existing lock. An elevated status confirmed the owned process was alive. It was cleanly stopped and restarted on the intended loopback port, with no unrelated database touched. Logs: `.postgres-test/credit-reservation-focused-sql.log`, `.postgres-test/credit-reservation-postgres.log`, `.postgres-test/credit-reservation-postgres-retest.log`.
3. Corrected focused SQL: **172/172 PASS**, 18.52 seconds, start **08:41:33 UTC**. Includes 48 new reservation cases plus the prior 124 ledger/action/read cases. Log: `.postgres-test/credit-reservation-focused-sql-retest.log`.
4. Added nine option-read/group-capacity cases and the parent form. Form/route TypeScript check passed. Log: `.postgres-test/credit-reservation-form-typecheck.log`.

5. Complete SQL regression: **917/917 PASS**, 16 files, 193.22 seconds, start **08:49:30 UTC**. This includes 181 credit ledger/action/options/reservation cases and all other SQL files. Independent readback confirmed the disposable guard plus zero users, bookings, purchases and redemptions after cleanup. Log: `.postgres-test/credit-reservation-full-sql.log`.

## Quality Gate

Corrected full `npm run check`: **PASS, exit 0**, **08:58:26-09:02:15 UTC**. Lint 0 errors / 42 existing warnings; route generation and TypeScript pass; **1,554 unit tests / 71 files** (29.81 seconds, start 08:59:03 UTC); optimized compilation and 82 generated pages pass. Log: `.postgres-test/credit-reservation-check-retest.log`. The middleware convention deprecation remains. No schema, migration, dependency or staging-manifest change was made; prior migration rehearsals are not relabeled as fresh tests.

Selected desktop/mobile browser regression and final cleanup are recorded below. Publication evidence is added after execution. No unexecuted check is marked passed.

### Failures And Corrections

First full `npm run check` stopped at lint, **08:52:58-08:54:25 UTC**: one unescaped JSX apostrophe in the new trainer-facing history text, plus 42 existing warnings. The apostrophe is now escaped without changing visible wording. TypeScript/unit/build stages of this failed command did not run. Log: `.postgres-test/credit-reservation-check.log`.

Review identified a financial-review predicate mismatch: SQL treats every non-null JSON value as a hold, while JavaScript truthiness allowed `false`, `0` and the empty string to appear spendable. Three focused integration tests **failed as expected** (available count 2, expected 0), start **08:55:12 UTC**, `.postgres-test/credit-reservation-review-baseline.log`. The shared new options/reservation validator now checks non-null presence, as does existing credit outcome/display validation. No SQL guard was weakened. All **3/3 focused retests passed**, start **08:56:00 UTC**, 2.08 seconds, `.postgres-test/credit-reservation-review-retest.log`; 181 unrelated cases were skipped in that focused run. Three corresponding outcome/display unit cases were added. Full SQL and the complete quality gate are rerun after this correction.

Corrected full SQL: **920/920 PASS**, 16 files, 117.70 seconds, start **08:56:07 UTC**. Includes all three new review-flag cases; no backend application change was made after this run. Log: `.postgres-test/credit-reservation-full-sql-retest.log`. UI-only retry-button visibility was tightened before the corrected full quality gate.

### Browser And Visual Correction

The first form selection passed **16/16** with one worker and no retries, **09:03:05-09:04:29 UTC**, 1.2 minutes. Built app on `http://127.0.0.1:3108`, synthetic local auth/receipts, fake Stripe keys, provider dashboard responses intercepted. Log: `.postgres-test/credit-reservation-focused-browser.log`.

At both 1440px and 390px, tests open purchase history, follow `View session credits`, select the service/child/date/time and reserve. They verify actual local API/SQL writes, parent and trainer dashboard readback, no per-booking payment/wallet entry, two siblings exhausting a shared balance, same payload on lost/malformed response retry, late-added financial hold rejection, held/retired options, read failure recovery and other-parent denial. No fixture precreates the tested reservation: its initial seed booking is removed before opening the form. Only the prior payment/credit entitlement is synthetic.

Screenshot review found a native date-control contrast defect despite the functional pass: Chrome's calendar icon was nearly black on the dark input. Added a CSS-state assertion and reran against the unchanged build. It failed as expected: **color-scheme `normal`, expected `dark`**, 12.7 seconds. Evidence: `.postgres-test/credit-reservation-date-before.png`, `.postgres-test/credit-reservation-date-baseline.log`, and preserved `.postgres-test/credit-reservation-date-failure` screenshot/trace/video. The input now explicitly uses dark native controls; subsequent screenshots capture the full page. The full quality gate and broader browser selection are rerun below. This visual edit does not change backend behavior or invalidate the recorded SQL execution scope.

The date-control rebuild passed the complete quality gate, **09:05:55-09:08:24 UTC**, including all 1,554 units. Its focused mobile two-sibling workflow passed **1/1**, 17.3 seconds, `.postgres-test/credit-reservation-date-retest.log`. Full-page review then exposed a second layout defect: the header refresh button shrank to **18px** under a 150-character package title instead of its intended **40px**. A new width assertion failed against the unchanged built app, `.postgres-test/credit-reservation-refresh-baseline.log`; before-image and trace/video are preserved in `.postgres-test/credit-reservation-refresh-before.png` and `.postgres-test/credit-reservation-refresh-failure`. The button now has nonshrinking flex sizing. Final full gate/browser results follow; the earlier cropped screenshot was insufficient to see this header defect.

### Toolchain Timeout

The next full quality gate, **09:11:17-09:14:55 UTC**, passed lint/TypeScript but stopped at an existing esbuild test: **1 failed / 1,553 passed**, with `tsx resolved esbuild > bundles TypeScript with imports and source maps` hitting the unchanged **5,000ms** test timeout (5,157ms observed). No booking assertion failed; the build stage did not run. Log: `.postgres-test/credit-reservation-final-check.log`.

An unchanged focused rerun passed **5/5**, 4.82 seconds total (2.41 seconds test execution), start **09:15:41 UTC**, `.postgres-test/credit-reservation-toolchain-retest.log`. No timeout, assertion or dependency was changed to obtain that result. This does not prove the transient timeout's underlying cause; the complete unchanged gate is rerun again, and the failed run remains part of the evidence.

### Final Local Gate

The complete unchanged rerun passed, **09:16:25-09:20:21 UTC**, exit 0. Lint 0 errors / 42 existing warnings; TypeScript passes; **1,554 units / 71 files**, 37.13 seconds, start **09:17:41 UTC**; optimized compilation and all 82 generated pages pass. Log: `.postgres-test/credit-reservation-final-check-retest.log`. The prior 5-second timeout is not represented as a fixed application defect.

Focused mobile geometry/workflow retest: **1/1 PASS**, 21.2 seconds, no retries. Both native dark-control theme and the refresh button's **40px** width pass. The same test books two siblings and verifies both dashboards. Full-page visual review shows wrapped headings/policy text, a visible date icon and a stable refresh target without overlap. Log: `.postgres-test/credit-reservation-refresh-retest.log`. The combined 116-case browser regression follows below.

### Combined Browser Regression And Cleanup

Final selection: **116/116 PASS**, one worker, zero retries, **09:21:49-09:30:46 UTC**, 8.9 minutes. Files: credit reservation (16), credit dashboard (26), credit actions (6), cash booking outcomes (20), checkout recovery (24), package history (24). Command: `npm run test:e2e -- e2e/credit-reservation-local-regression.spec.ts e2e/credit-dashboard-local-regression.spec.ts e2e/credit-actions-local-regression.spec.ts e2e/booking-outcome-local-regression.spec.ts e2e/checkout-recovery-local-regression.spec.ts e2e/package-history-local-regression.spec.ts --workers=1 --retries=0`. Log: `.postgres-test/credit-reservation-full-browser.log`.

Expected: one persisted reservation/debit per request, shared sibling spending, correct participant views, no extra cash payment, safe recovery and denied unauthorized access. Actual: every selected assertion passed. This is the selected local regression, not every repository E2E file and not an actual Stripe sandbox transaction.

Reviewed full-page screenshots: [1440px](screenshots/credit-reservation-1440.png), [390px](screenshots/credit-reservation-390.png). A deliberately long package title wraps without displacing the refresh target. Native date controls are visible; policy text and form fields do not overlap. Mobile selected-option text is width-limited by its native control; the complete session title and credit count are repeated below it.

Independent SQL readback after the suite confirmed the disposable guard and **zero users, bookings, payments, purchases, grants, receipts, redemptions and sports**. No unknown rows were deleted. The owned local application server and disposable PostgreSQL cluster were stopped after browser verification. No schema/migration/dependency/environment-secret change was made.

## Published Source

Source **`52698d97868bbe895d6756e66361606f4ee89b7b`** (`feat: book shared package credits through parent flow`) was committed and pushed to `codex/payment-readiness-20261006`. Remote readback matched; main remained **`2067e743c54ffee669cd484f26dc472b157f1881`**. The local tests above ran on this application tree before its commit, not on a later documentation-only commit.

[GitHub Actions run 38377044299](https://github.com/StylereTech/trainr/actions/runs/38377044299): `check` and `migrations` both failed **09:32:26-09:32:28 UTC**; fresh jobs metadata contains **zero steps** for both. This is not a CI pass or a newly executed migration test. Prior account/billing evidence is not fresh proof of this run's cause. Vercel Preview Comments succeeded, but that check does not execute application tests. No billing or workflow setting was changed.

At **09:33:50 UTC**, the source commit's Vercel status reported **success** for [deployment G5gqsrYYXhgoou24UkZQkxvaHrzp](https://vercel.com/styleres-projects/trainr/G5gqsrYYXhgoou24UkZQkxvaHrzp). No manual deployment, Production alias change or hosted migration-log access was performed.

### Anonymous Preview Retest

**14/14 PASS**, **09:34:00-09:34:03 UTC**, no cookies or account, on `https://trainr-git-codex-payment-readiness-20261006-styleres-projects.vercel.app`:

| Method and route | Expected | Actual |
| --- | --- | --- |
| GET `/api/health` | 200, ok and database connected | PASS |
| GET `/api/trainers?limit=1&page=1` | 200, valid paginated catalog | PASS; **0 trainers** |
| GET `/api/bookings` | 401 | PASS |
| GET `/api/trainer/packages` | 401 | PASS |
| GET `/api/trainer/wallet` | 401 | PASS |
| GET `/api/package-purchases` | 401 | PASS |
| POST `/api/payments/checkout`, empty JSON | 401 | PASS |
| POST `/api/payments/webhook`, unsigned empty JSON | 400 | PASS |
| PATCH `/api/bookings/audit-anonymous-probe`, empty JSON | 401 | PASS |
| PATCH `/api/admin/bookings`, empty JSON | 401 | PASS |
| GET `/api/dashboard/bookings?view=upcoming` | 401 | PASS |
| GET `/api/admin/bookings` | 401 | PASS |
| GET `/api/bookings/credits?purchaseId=audit-anonymous-probe` | 401 | PASS |
| POST `/api/bookings/credits`, empty JSON | 401 | PASS |

All responses were JSON with the expected contracts. Log: `.postgres-test/credit-reservation-hosted-smoke.json`. The script's source SHA is a requested label, not an independently returned runtime version; stable-alias-to-source mapping was **not independently verified**. These negative-access/health checks do not prove signed-in hosted reservation or payment functionality. Hosted browser actions remain unavailable due the previously observed approval-service limit; no alternate browser/API bypass was attempted. No Stripe transaction, connected-account onboarding, transfer or payout was performed in this pass.

## Remaining Gates

This makes paid credits usable for reservation through the locally tested API/form, but does not establish purchase through public Stripe Checkout. Actual signed-in hosted checkout, webhook delivery, trainer Connect onboarding, destination transfer and payout proof remain unverified. Email setup is deferred. Fresh anonymous Preview catalog again has zero eligible trainers. CI execution, dependency findings, pending expiry/retirement policy and other release gates remain open. Remaining work includes unfinished application code, not only external dependencies. Overall production status: **HOLD**.
