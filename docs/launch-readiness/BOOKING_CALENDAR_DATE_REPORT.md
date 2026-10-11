# Booking Calendar Date Audit

## Identity And Scope

- Date/time: 2026-10-11, baseline browser reproduction around 06:29 UTC; final verification below.
- Baseline source: `0a36b66755fa8fae8896fd668304082d972dac32`; the existing optimized build has identical application source to `0053b01`. Fix is in the commit containing this report.
- Environment: isolated local audit checkout, optimized Next app at `http://127.0.0.1:3107`, guarded disposable PostgreSQL `trainr_audit_20261008` on loopback port 55439. Installed Chrome driven by Playwright.
- Accounts: generated synthetic `browser-<UUID>@example.test` PARENT, TRAINER and ADMIN users. No real parent/child data, production records, Stripe credentials or money movement.
- Routes: `/parent/dashboard` Open/Past, `/trainer/dashboard` Pending/Completed, `/admin`, `/admin/bookings`; authenticated underlying dashboard/admin APIs and actual local booking creation/retry in the broader regression.
- Overall production/money-flow status remains **HOLD**. This fixes a calendar-day display defect, not trainer time-zone configuration, past-start validation, hold expiry or actual Stripe settlement/payout verification.

## Reproduction

The database stores `Booking.date` as the intended calendar date at UTC midnight, with `startTime` and `endTime` stored separately. Booking creation and Stripe checkout description already retain that day. Parent Open/Past, trainer dashboard and admin overview instead used the viewer's local date conversion. The admin booking queue had already specified UTC explicitly, creating inconsistent views.

Before rebuilding the changed application, run:

`npx playwright test e2e/booking-date-local-regression.spec.ts --project=chromium --workers=1 --reporter=list --grep 'America/Los_Angeles 1440px.*PARENT' --output=test-results/booking-date-baseline`

Use the existing guarded test database settings, loopback `BASE_URL`, matching local-only auth secret, and `LOCAL_E2E_CHANNEL=chrome`. The fixture creates actual synthetic SQL records for January 1 and March 10, 2030 and authenticates a parent through a local test session.

Expected: `1/1/2030` and `3/10/2030`. Actual: **FAIL**, the rendered parent dashboard shows `12/31/2029` and `3/9/2030`; the January 1 assertion failed. The failure snapshot also shows the correct separate `09:00 - 10:00` clock time and unpaid state. Retained [pre-fix screenshot](evidence/booking-date-20261011/parent-before.png); raw context remains in ignored `test-results/booking-date-baseline/booking-date-local-regress-455d3-es-across-views-and-refresh-chromium/error-context.md`. This is a rendered reproduction, not only source inspection.

Independent SQL after fixture cleanup returned the exact disposable guard marker and zero users, bookings and payments. The baseline local application was stopped before rebuilding.

## Fix

All affected booking views now use one `formatBookingDate` helper that explicitly preserves the stored UTC calendar day. The already-correct admin booking queue uses the same helper. Invalid date values yield `Date unavailable` rather than a formatter exception. Actual timestamp fields such as account creation and review submission retain their original local formatting.

No database migration, date backfill, booking-time reinterpretation, fee change or Stripe destination change occurs. A date stored at UTC midnight is not a claim that the training session starts at midnight UTC. The separate trainer/session time-zone requirements remain unresolved.

## Verification

1. `npm test -- tests/booking-date.test.ts`: **PASS, 9/9**. Five calendar boundaries, including leap day and DST transition dates, are preserved for date-only strings, ISO timestamps and Date objects under six process time zones. Invalid inputs do not crash rendering.
2. `npm run check`: **PASS, exit 0**. Lint (existing warnings), TypeScript and **1,016/1,016 unit tests in 51 files passed**; optimized build generated 73 pages. Browserslist freshness and existing lint warnings remain, not a warning-free build claim.
3. Final command: `npx playwright test e2e/booking-date-local-regression.spec.ts e2e/booking-retry-local-regression.spec.ts e2e/dashboard-local-regression.spec.ts --project=chromium --workers=1 --reporter=list --output=test-results/booking-date-final`. **PASS, 28/28 in 6.5 minutes, exit 0**, completed approximately 06:45 UTC. No skips, retries, timeout increases or weakened assertions.
4. Date matrix: **12/12 passed**, three roles, two browser zones (Los Angeles/Tokyo), two widths (1440/390), view changes, reload, independent stored-date readback and zero payment creation. All saved dates remain exact UTC-midnight values in SQL. Every displayed booking date matches the saved day; parent/trainer/admin views agree.
5. Extended reservation/retry matrix: **8/8 passed**, actual local HTTP/SQL reservation workflow in Los Angeles. The selected date remains correct on the persisted dashboard after refresh, including cancelled and zero-due recovery. One reservation is retained through lost/malformed responses, and coupon usage is not duplicated. Provider checkout remains simulated, not actual Stripe payment proof.
6. Broader dashboard matrix: **8/8 passed**, actual SQL pagination/counts and persisted trainer actions, plus simulated read failures. Seeded paid-state fixtures exercise dashboard behavior only, not real paid transactions.
7. Inspected desktop parent and mobile parent/trainer/admin screenshots. Correct dates are visible and document-width assertions passed. Retained [parent mobile](evidence/booking-date-20261011/parent-after-mobile.png), [trainer mobile](evidence/booking-date-20261011/trainer-after-mobile.png) and [admin mobile](evidence/booking-date-20261011/admin-after-mobile.png). These show synthetic records and do not represent real trainer earnings.
8. Independent SQL after the complete run counted zero users, bookings, payments and sports. Local application and disposable database stopped cleanly. No migration or production write occurred.

## Publication And Remaining Gates

2026-10-11 06:50 UTC: source `d7460ab19ab3db1c06c8c49fd8ace6671c9f5ca6` is committed and pushed to `codex/payment-readiness-20261006`; local HEAD and origin tracking branch match and the working tree is clean. Vercel audit project `trainr` deployment `eVeXwqNKSBRYrmwL8Mtyqebmu1PQ` is **Ready**, Preview, build duration 1m 6s, created 06:48:20 UTC. Its source SHA and stable branch-domain mapping were read from Deployment Details. Unique deployment: `https://trainr-1jhzm4zt6-styleres-projects.vercel.app`.

Hosted retest used the existing owner-signed-in PARENT account on `https://trainr-git-codex-payment-readiness-20261006-styleres-projects.vercel.app`, without mocked responses or injected sessions:

1. Reload `/parent/dashboard`: expected persisted session/athlete and empty booking state; **PASS**, one saved athlete, zero open bookings, no upcoming sessions.
2. Select Past (0): expected empty history with disabled pagination; **PASS**, no past sessions and page 1 of 1 (0 bookings).
3. Open the saved synthetic athlete: expected original saved fields; **PASS**, Sandbox Athlete, 2014-01-15, Intermediate, Basketball/Soccer and synthetic-only goals/notes persist.
4. Navigate directly to `/trainer/dashboard`, then `/admin`: expected parent role denied each protected page; **PASS**, both resolve to `/parent/dashboard` with Parent dashboard rendered.

The signed-in Preview account remains a parent with no bookings, so it cannot supply hosted trainer/admin or populated booking-date proof. Correct populated date rendering is proven by the local SQL/browser matrix above, not by this hosted empty-state smoke. The owner has been asked whether to use an existing trainer account or open trainer signup; no credentials, role changes or verification bypasses were introduced. Full sandbox booking/Connect/transfer/payout and package flows remain incomplete or unverified. Resend remains owner-deferred. Story, main and Production are unchanged. This publication evidence is recorded in the subsequent documentation-only commit.
