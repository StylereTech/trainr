# Booking Layout Readiness

## Scope

- Date: 2026-10-11; baseline and implementation started after 17:53 UTC.
- Baseline: `d9b67e711ab286360f4521b80e14f309c3bf49dd`, audit branch `codex/payment-readiness-20261006`.
- Environments: compiled loopback app, synthetic browser API responses, guarded disposable PostgreSQL for the existing integration/persistence suites. Publication is Preview only.
- Accounts: synthetic local parent/trainer/admin fixtures; existing hosted parent used only for read/access smoke. No real payment or bank operation.
- Surface: `/book/[slug]`, service/athlete/date/time selection, quote display, optional notes, empty service state and checkout review. No API, database schema, fee, refund, package-credit or Stripe behavior is intentionally changed.

## Findings And Repair

P2 UX: the previous page put promotional content and a decorative media panel ahead of the transaction. The generic-sport screenshot from the refund audit included a literal media placeholder and was 4,959px tall at 390px width. Mobile checkout review/action was hidden behind a separate top-of-page toggle. Empty service lists still rendered the booking form without a specific unavailable state. Selection buttons did not expose pressed state, and the athlete selector lacked an associated label.

Eight baseline cases at 320, 390, 1024 and 1440px failed against the previous compiled application: four on promotional copy and four on missing empty-service messaging. Evidence `.postgres-test/booking-layout-baseline.log` and failure artifacts in `.postgres-test/booking-layout-baseline-results`. The Soccer fixture used an actual existing image, so these eight baseline failures do not independently reproduce the generic-sport placeholder; that evidence is retained in the preceding UI audit.

The repair removes the promotional/media region and nested section cards, uses a compact trainer heading and unframed form sections, and keeps review/payment controls available without a mobile expansion gate. Service/date/time controls expose pressed state; athlete selection has a label. Empty services get an explicit unavailable state and browse route with no payment button. Existing unverified-screening disclosure remains, while the unsupported instant-confirmation claim is removed. Retry controls have explicit light-surface contrast. Large amounts, long text, keyboard selection, and all four widths passed browser validation.

The five existing booking/recovery browser files now assert the always-visible review heading instead of clicking the removed mobile toggle. Their quote, zero-due, duplicate prevention, immutable time, payment state and persistence assertions remain in place.

The inline athlete-save test previously used an empty-service trainer. Its fixture now includes a synthetic service so that the athlete form remains reachable under the new unavailable-state contract. Actual athlete persistence, uncertain-save, disabled-close and duplicate-prevention assertions are unchanged; the new empty-service tests verify the alternative state separately.

## Verification Ledger

| Check | Result | Evidence |
| --- | --- | --- |
| Four-width negative/empty baseline | Eight failed, exit 1 | `.postgres-test/booking-layout-baseline.log` |
| Lint/type/unit/build | Exit 0; 43 existing warnings, zero errors; 1,297 units / 61 files, 75 static pages | `.postgres-test/booking-layout-check.log` |
| Final page lint after contrast adjustment | Exit 0; two existing hook warnings, no errors | `.postgres-test/booking-layout-final-page-lint.log` |
| New four-width layout/empty tests | Eight passed, 24.5s, exit 0 | `.postgres-test/booking-layout-focused.log` |
| Full real PostgreSQL suite | 404 passed / 12 files, 88.50s, exit 0 | `.postgres-test/booking-layout-full-sql.log` |
| Initial full desktop/mobile attempt | Stopped after 70 passes and three retry failures; not a full pass | `.postgres-test/booking-layout-full-browser.log` |
| Corrected full quality gate, first attempt | Lint/type passed; test bundler could not read an ancestor directory under filesystem sandbox; exit 1 before unit execution | `.postgres-test/booking-layout-final-check.log` |
| Corrected full quality gate, authorized rerun | Exit 0; 43 existing lint warnings, zero errors; 1,297 units / 61 files (98.33s), 75 static pages | `.postgres-test/booking-layout-final-check-escalated.log` |
| Corrected focused browser suite | 16 passed, 2.0 minutes, exit 0: eight four-width layout cases and eight persisted retry cases | `.postgres-test/booking-layout-corrected-focused.log` |
| Corrected full browser attempt | Stopped after 58 passes to investigate the long-name boundary; not a full pass | `.postgres-test/booking-layout-final-browser.log` |
| Long-name initial geometry check | Two passed, but screenshot inspection exposed clipped text: document width alone was insufficient | `.postgres-test/booking-name-baseline.log` |
| Strengthened long-name baseline | Two failed at 320/390px on text-range bounds | `.postgres-test/booking-name-range-baseline.log` |
| Long-name/location repair full quality gate | Exit 0; 43 existing lint warnings, zero errors; 1,297 units / 61 files (69.73s), 75 static pages | `.postgres-test/booking-layout-release-check.log` |
| Independent final-source page lint | Exit 0; two existing hook warnings, no errors | `.postgres-test/booking-layout-release-page-lint.log` |
| Final focused layout/name/retry tests | 18 passed, 2.9 minutes, exit 0 | `.postgres-test/booking-layout-release-focused.log` |
| Final complete desktop/mobile suite | 270 passed, 31.1 minutes, exit 0; no failures/skips | `.postgres-test/booking-layout-release-browser.log` |
| Final PostgreSQL integration rerun | 404 passed / 12 files, 168.22s, exit 0 | `.postgres-test/booking-layout-release-sql.log` |
| Independent fixture cleanup and owned-server shutdown | Passed at 19:22 UTC; zero rows in all 12 checked fixture tables; Next and PostgreSQL stopped | `.postgres-test/booking-layout-release-cleanup.log` |
| Commit/push, Ready Preview and hosted smoke | Pending | No pass claimed |

## Retest Details

Reproduction uses the built app at `http://127.0.0.1:3108`, the guarded loopback database `trainr_audit_timezone_20261011` on port 55439, local synthetic sessions and installed Chrome. The focused tests load `/book/[slug]`, exercise keyboard service selection, choose an owned athlete/date/time, wait for the quote, inspect the enabled review action, and check geometry and error-free rendering. Empty-service fixtures must omit payment controls. Retry tests intercept the first committed booking response, retry the same request, and verify one stored booking/coupon use after dashboard refresh. Stripe checkout responses are synthetic, not real provider receipts.

```sh
npm run check
npm run test:postgres
node node_modules/@playwright/test/cli.js test e2e/booking-layout-local-regression.spec.ts e2e/booking-retry-local-regression.spec.ts --workers=1 --reporter=list
node node_modules/@playwright/test/cli.js test 'local.*\.spec\.ts$' --workers=1 --reporter=list
```

These reproduction commands require the documented loopback test environment; do not run the browser fixtures against Production. The retained logs above contain the actual results and separate failed, interrupted and completed attempts.

The initial full run exposed a redesign regression: the explicit `Payment collected at Stripe checkout` notice had been removed. All three observed retry failures stopped at that missing-copy assertion. The redesign also changed the previously tested disabled-field colors; those assertions had not yet been reached. Restored the notice and the high-contrast disabled foreground/background/opacity without weakening the retry tests. Stopped the first run, verified zero local users/bookings/payments/sports after cleanup, and started a new complete quality gate before focused and full browser reruns. The 70 initial passes are not a final full-suite result.

Later review checked the maximum permitted 50-character unbroken trainer name. Initial document-width assertions passed, but the inspected 390px screenshot showed back-link text clipped beyond the form. Added DOM text-range bounds, reproducing two failures at 320/390px. The back link now has a bounded flex width and a shrinkable, wrapping text span. Applied equivalent wrapping to the location line and added that field to both range checks. All ten layout/name cases and eight persisted retry cases passed on the final rebuilt app; inspected the final 320px boundary screenshot and confirmed both fields fully wrap. The second full browser attempt stopped at 58 passes; no complete pass is claimed from it. The final 270-case run follows this repair.

Inspected the focused 320px populated form, 1440px populated form and 320px empty-state screenshots. The form reaches service selection in the first viewport, maximum-price text fits, selected controls are visually clear, the mobile review/action is not hidden, and the empty-state browse action is readable. The populated 320px screenshot is 3,120px tall including the unchanged global footer; its long-title/two-service fixture differs from the prior single-service 390px screenshot, so those heights are not a like-for-like improvement measurement. Screenshot root: `.postgres-test/booking-layout-focused-results`.

After restoring the payment notice and disabled styling, inspected the 1440px uncertain-response screenshot under `.postgres-test/booking-layout-corrected-focused-results/booking-retry-local-regres-c3405-sponse-with-one-reservation-chromium/booking-uncertain.png`. Saved fields, explicit uncertainty, dashboard recovery link, retry action and Stripe notice are readable without overlap. All eight real-SQL retry scenarios passed at 1440/390px, including exact request replay, one booking, one coupon use, cancelled/free checkout suppression and refreshed payment state.

Hosted read-only observation at approximately 18:16 UTC: the existing parent dashboard still displayed one saved synthetic athlete and zero bookings. Stripe sandbox account `acct_1RAkm8PvdPuIlEw5` displayed `All 0`, `Enabled 0`, and `No connected accounts` in a screenshot after earlier accessibility/DOM capture failures. No trainer onboarding or payment proof is inferred from that empty list.

## Retained Visual Evidence

The unchanged single-service maximum-price fixture now produces a 390 x 2,798px full-page image, compared with 390 x 4,959px before: approximately 44% shorter, including the unchanged global header/footer. Inspected the final image: service selection appears before the calendar, the currency remains on one line, and the review/payment control is visible without a toggle. This is a synthetic maximum-price stress case, not a real commercial offer or hosted purchase.

- [Before: 390px single-service booking](evidence/booking-layout/before-390.png)
- [After: the same 390px maximum-price fixture](evidence/booking-layout/after-390.png)
- [After: 320px unbroken trainer name and location](evidence/booking-layout/long-name-320.png)

## Remaining Gates

This is a booking UI repair, not actual hosted Stripe Checkout, trainer onboarding, destination transfer or payout proof. Package purchasing/credit storage, unpaid-hold policy, remaining dependency/security findings, GitHub CI billing lock and broader launch gates remain open. Resend/Replit remain deferred; expected local reset-email-unavailable diagnostics are not delivery proof. Main, Production and Story are unchanged; overall **HOLD**.

## Cleanup And Publication

At 19:22 UTC, an independent `psql` read verified database `trainr_audit_timezone_20261011`, role `trainr_test`, the disposable integration guard and zero rows in users, bookings, payments, packages, package items, service offerings, sports, Connect attempts, checkout attempts, refunds, wallet entries and withdrawals. The app server was stopped after the browser run. The first PostgreSQL stop request was denied by the process sandbox; the authorized exact-data-directory retry exited 0 and reported `server stopped`. No required local test process remains running.

Source publication and hosted retest follow after the scoped audit-branch push. No main or Production deployment is authorized by these local results.
