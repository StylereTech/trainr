# Package Credit Policy And Preview Recovery

## Scope And Approval

Started 2026-10-12 12:09 UTC. Source baseline `3ab493958081c3f0c824f7e64d7f778d0853b5ca`, branch `codex/payment-readiness-20261006`. User approved the outstanding Preview redeployment, signed-in Preview testing and proposed package policy. Main, Production, Story, real funds and credential changes remain excluded.

Approved policy: credits belong to the purchasing parent and may be used across that parent's children. Validity begins at successful payment. Trainer cancellation, or parent cancellation **at least 24 hours** before the session, restores the credit. Later parent cancellation and no-show consume the credit. Cash-refund eligibility remains separate; existing published refund promises are not changed by this approval.

## Implementation Boundary

New prepared purchases store version-two immutable terms including the approved credit policy. Historical version-one terms remain readable and replay without retroactive policy assignment. The SQL constraint accepts legacy records and requires the approved policy values on version-two records. The existing immutable-snapshot trigger remains unchanged. The additive migration is allowed only through the existing guarded audit Preview initializer; no Production migration was performed.

This is policy persistence, **not credit redemption**. No public package sale, spendable balance, expiry enforcement, automatic credit restoration or cash refund execution is enabled by this change. Successful-payment timestamps still need authoritative provider evidence when redemption is implemented; neither creation time nor delayed grant time is a substitute.

## Hosted Recovery And Parent Checks

Existing browser session: parent account owning the explicitly synthetic `Sandbox Athlete`; no credentials copied or modified. Before retry the deployed application was the preceding Ready source. Recovery deployed source `6a68db061303c5b41f65958b6c30e01705843a0d`, not the new policy implementation.

| Steps / route | Expected | Actual / status |
| --- | --- | --- |
| Redeploy failed Preview `ADd5Anhi4BtbcQcDUfUB4GADtSPq` with Preview selected | Start build | First approved attempt rejected by GitHub secondary rate limit. No application build started. |
| Retry once after several minutes doing unrelated tests | Same source builds without changing environment | PASS. Deployment `2fT2FYMEo5Tio32aDDiYfRSqgjYU` Ready at 12:16:44 UTC, source `6a68db0`, duration 1m21s. |
| Open `/parent/dashboard`, reload and wait for session/data | Retained parent session and saved athlete | PASS. One saved athlete, Basketball/Soccer; zero open bookings. |
| Open saved synthetic athlete, submit unchanged profile | Save completes and returns to dashboard | PASS. Form read back stored values; save returned to parent dashboard with the same athlete. This is an unchanged-save test, not a new-child or changed-field test. |
| On recovered source, append a synthetic persistence marker to Parent notes; save, reopen and fully reload; restore original notes, save and fully reload again | Both writes persist across reload; original value restored | PASS. Marker `Persistence check 2026-10-12.` survived reload, then original `Synthetic staging test profile. Not a real child.` was restored and verified after another reload. No real-child data changed. |
| Dashboard -> My packages | Owned history view loads | PASS empty state: zero purchases, disabled pagination; no paid-history claim. |
| Parent dashboard -> Past; direct `/trainer/dashboard` navigation | Past empty state works; parent cannot enter trainer dashboard | PASS. Past tab displays no past sessions. Trainer route redirects to `/parent/dashboard`. |
| Find trainers -> Clear Filters | Unfiltered catalog loads | PASS navigation/empty state; still zero eligible trainers. Booking prerequisite remains BLOCKED. |
| Anonymous smoke on unique recovered deployment URL | JSON API responses | INVALID TEST TARGET. Vercel protection redirected GETs to an HTML sign-in page; POST statuses also came from protection. No application pass or auth-bypass conclusion is drawn. |
| Retest stable audit Preview alias with redirects disallowed and JSON required | Health/catalog 200; protected routes 401; unsigned webhook 400 | PASS all eight cases. Health connected; catalog empty. |

[Recovered deployment](https://vercel.com/styleres-projects/trainr/2fT2FYMEo5Tio32aDDiYfRSqgjYU). Anonymous retest routes: GET `/api/health`, `/api/trainers?limit=1&page=1`, `/api/bookings`, `/api/trainer/packages`, `/api/trainer/wallet`, `/api/package-purchases`; POST empty JSON `/api/payments/checkout`, `/api/payments/webhook`. Logs: ignored local `.postgres-test/policy-recovered-preview-smoke.json` (invalid target) and `policy-recovered-preview-smoke-retest.json` (corrected test). Existing Vercel protection was not disabled.

## Local Verification

Owned disposable PostgreSQL at loopback port 55439: independently verified database `trainr_audit_timezone_20261011`, role `trainr_test`, marker `disposable integration database` before migration. No hosted test fixtures or production writes.

- Focused schema tests: 38 passed.
- Initial focused purchase SQL tests: 36 passed, including policy persistence and attempted immutable rewrite/incomplete insert rejection.
- Added legacy replay and per-policy SQL rejection cases after that focused run. Full SQL retest: **706 tests / 15 files passed**, 190.12s, started 12:37:39 UTC. Includes independent-connection policy persistence, legacy replay, malformed insert rejection, immutable terms and all existing financial/concurrency suites.
- First full gate stopped at TypeScript: three new test inserts copied nullable output JSON (`financialReview`) into Prisma input. Corrected by excluding that unused nullable field from synthetic clones.
- Second gate passed lint/typecheck, then reported 1,472 unit passes and three failures: two existing esbuild cases hit their 5-second limits under full-suite contention; the migration manifest test still expected 20 instead of 21. Updated the reviewed count and added a Preview/main guard case for this migration. No timeout or security assertion was weakened.
- Focused rerun with `VITEST_MAX_WORKERS=1`: 80 tests across esbuild security, staging initializer and package-policy contracts passed in 8.74s. Final **`npm run check` passed** with that supported environment setting: lint (0 errors, 42 existing warnings), TypeScript, **1,476 units / 67 files**, optimized 81-page build. Unit run started 12:31:39 UTC and took 145.30s. Build compiled in 42s and completed its TypeScript phase in 36s.
- Initial sandbox invocations failed before tests (Windows/esbuild path access and PostgreSQL restricted-token creation). Scoped elevated retries ran successfully; these were environment failures, not ignored test failures.

Hosted dashboard screenshot was inspected at its actual 1243x910 viewport. A requested 390px override did not affect that tab (DOM width remained 1243); override was reset and this attempt is **not** mobile evidence. Local Playwright parent history fixtures use version-two terms, while trainer history fixtures retain version-one terms at both explicit 1440px and 390px sizes.

Initial local browser run: **23 passed / 1 failed** in 6.4m. First parent desktop history case hit its unchanged 30-second timeout and fixture teardown reported a foreign-key failure. After the run, independent guarded SQL reads found zero users, sports and purchases; delayed cleanup had completed, so no manual deletion was performed. Failure artifacts retained in ignored `.postgres-test/policy-browser-first-failure`. The exact case then passed in 15.9s (23.4s run) without changing code, assertions or timeouts. **Clean full rerun: 24 passed in 3.9m**, one worker, retries zero. Parent mobile and trainer desktop screenshots were visually inspected: readable wrapped long titles, no overlapping controls; browser assertions checked no horizontal overflow. Retained final screenshots: [parent 390px](screenshots/package-policy-parent-390.png), [trainer 1440px](screenshots/package-policy-trainer-1440.png).

Final independent SQL read confirmed the disposable marker and zero users, bookings, payments, package purchases, credit grants and checkout closures. Owned local app and PostgreSQL services were stopped. No test fixture deletion or schema modification occurred in Production.

Local logs: `.postgres-test/policy-check.log` (initial type error), `policy-check-retest.log` (three unit failures), `policy-focused-retest.log` (80 passes), `policy-check-final.log` (full pass), `policy-postgres-final.log` (706 passes), `policy-browser-final.log` (23/1), `policy-browser-focused.log` (focused pass), `policy-browser-retest.log` (full rerun).

## Remaining Gates

Public package purchase and atomic credit redemption/restoration remain incomplete. The hosted catalog has no selectable trainer; the last refreshed Stripe sandbox had zero connected accounts. User input requested for owner-controlled trainer login/signup. Stripe account agreements and credential entry remain user-controlled. Actual sandbox charge, signed webhook, destination transfer, payout, refund execution and final Production release are unproven. **Overall HOLD.**

New policy source is not yet committed/pushed/deployed as of this entry. Publication and final verification will be appended after checks complete.
