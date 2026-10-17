# Cash Payment Review Presence Audit

Latest verified result, **2026-10-13 13:43 UTC**: source `6481c762b4d1556f6e22e456b92d5f5466015de5` is pushed and deployed to Preview; local full quality gate, 1,019 SQL cases, 60 browser/API cases and 16 anonymous hosted probes passed. Overall readiness remains **HOLD**.

## Baseline

- Date: 2026-10-13 UTC. Baseline commit `41a73cfbce96b9d59011d558ba3dc27211129dd8`; clean audit branch at entry. Previous pass made progress by publishing the credit-hold fix and verifying Preview.
- Scope: owned local disposable database and existing audit Preview only. Production/main, Story, real funds, account credentials and billing unchanged. Hosted trainer signup handoff remains pending.
- Finding: cash booking actions and read DTOs used JSON truthiness, which treated JSON null, false, zero and empty-string financial reviews as clear. SQL NULL is the only clear state. This can permit confirmation/outcomes and hide review warnings.

## Reproduction And Fix

- Environment: local PostgreSQL `trainr_audit_timezone_20261011`, owner `trainr_test`, port 55439, purpose marker `disposable integration database`; random synthetic parent/trainer/admin accounts with `example.test` emails. Stripe responses are simulated.
- Steps: settle a synthetic cash booking, set each review representation, attempt trainer/admin confirm/complete/no-show, and read parent/trainer dashboard DTOs. Expected: 409 without booking/statistic/notification writes and review flag true without private detail. A scoped mock clock places outcome tests after the immutable fixture session.
- Initial fixture run (13:19:09 UTC): 19 failed / 1 passed; 15 failures were caused by the test attempting to edit immutable timestamps, not proof of an action bypass. Four dashboard failures were valid. Original log: `.postgres-test/cash-review-baseline.log`.
- Corrected baseline (13:20:07 UTC): **16 failed / 4 passed**, 4.56 seconds. Twelve trainer mutations succeeded instead of rejecting and four projections returned false. Object-held controls passed. Log: `.postgres-test/cash-review-baseline-corrected.log`.
- Fix: use `financialReview IS NOT NULL` in the existing payment row-lock query for mutations; normalize read projections through bounded `not: Prisma.DbNull` queries in each existing RepeatableRead snapshot. Preserve truthy admin review detail, using true for held falsy values. No lock-order, timeout, migration or payment-clearing change.
- Focused retest (13:21:06 UTC): **20/20 passed**, 4.30 seconds, 136 filtered tests. Both trainer/admin actions now reject, with unchanged bookings, statistics and notices. Log: `.postgres-test/cash-review-focused.log`.
- Extended tests cover held cancellation with unchanged payment/review, SQL-null controls through existing regressions, and desktop/mobile trainer/admin outcomes plus parent warnings and participant/admin API projections after refresh.

## Verification Status

- Full SQL regression: **1,019/1,019 passed**, 16 files, start **13:22:13 UTC**, duration **155.30 seconds**, terminal exit 0. Log: `.postgres-test/cash-review-full-sql.log`.
- First quality gate: lint 0 errors / 42 existing warnings and types passed; units were **1,605 passed / 1 failed**, start **13:27:24 UTC**, 67.94 seconds. The lock-order unit expected the old SELECT text. Updated it to require the new `IS NOT NULL` projection, preserving exact booking-before-payment ordering; no application change or relaxed timeout. Build was not reached. Original log: `.postgres-test/cash-review-check.log`.
- Focused unit retest: **94/94 passed**, three files, **13:29:00 UTC**, 2.64 seconds. Log: `.postgres-test/cash-review-unit-focused.log`.
- Final quality gate: **PASS**, terminal exit 0; lint 0 errors / 42 existing warnings, TypeScript, **1,606/1,606 units** in 75 files (start **13:29:51 UTC**, 45.16 seconds), Prisma generation and optimized Next build. Log: `.postgres-test/cash-review-check-final.log`. Existing middleware-deprecation and Edge Runtime `process.cwd` warnings remain. No migration changed in this pass.
- Final selected browser/API suite: **60/60 passed**, 5.2 minutes, one worker and zero retries; completed before **13:39:49 UTC**. Log: `.postgres-test/cash-review-browser.log`. Local app log shows startup/ready only, without reported application errors. These results cover the named cases, not every platform workflow.
- Independent final SQL read verified the disposable marker and zero rows in users, bookings, payments, package purchases, sports, both checkout-attempt tables, credit grants/redemptions and payment receipts. Local Next server and owned PostgreSQL cluster were stopped. Screenshot verification and publication evidence are recorded below.

## Browser Scope

Built app: `http://127.0.0.1:3108`, same owned disposable database, random synthetic sessions. Connect and wallet observations are mocked; booking actions and persistence use the real local API/database. Command: `npm run test:e2e -- e2e/booking-outcome-local-regression.spec.ts e2e/credit-dashboard-local-regression.spec.ts --workers=1 --retries=0`. The runner discovered **60** cases (the earlier estimate of 58 was incorrect). Viewports: 1440x1000 and 390x1000.

| Routes / endpoints | Steps and expected result |
| --- | --- |
| `/trainer/dashboard`, `/admin/bookings` | Load elapsed JSON-null/false-held cash booking, see warning and disabled outcome controls; reload and preserve hold. Future/ongoing/elapsed/unknown-time and revoked-parent regressions remain covered. |
| `/parent/dashboard` | Load same held cash booking in a separate parent session, show review warning and preserve readable mobile layout. |
| GET `/api/bookings`, `/api/dashboard/bookings?view=all`, `/api/admin/bookings` | Authenticated owning participant/admin receives review flag true for held falsy values. |
| PATCH `/api/bookings/[id]` | Direct completion request returns 409; booking remains confirmed and payment unchanged. |
| Credit dashboard regressions | Parent/trainer/admin clean/held/JSON-null/restored funding and cancellation/recovery continue to work. |

Six accepted screenshots were visually inspected: warnings and labels fit; trainer/admin completion is visibly disabled. The first desktop parent capture lacked its navigation header, despite readable main content; its cause is unknown. The separately captured admin-case parent image includes the header and is the accepted desktop artifact below. No CSS was altered based on the transient capture alone.

| Role | Desktop | Mobile |
| --- | --- | --- |
| Parent | [1440px](screenshots/cash-review-parent-1440.png) | [390px](screenshots/cash-review-parent-390.png) |
| Trainer | [1440px](screenshots/cash-review-trainer-1440.png) | [390px](screenshots/cash-review-trainer-390.png) |
| Admin | [1440px](screenshots/cash-review-admin-1440.png) | [390px](screenshots/cash-review-admin-390.png) |

## Published Preview

- Committed and pushed `6481c762b4d1556f6e22e456b92d5f5466015de5` to `codex/payment-readiness-20261006`; main remains `2067e743c54ffee669cd484f26dc472b157f1881`. No production promotion or migration change occurred.
- [Vercel deployment](https://vercel.com/styleres-projects/trainr/3fhLFxq922EodcBTt9bKyEBx93BR) was verified in the normal UI as Ready / Latest / Preview, completed **13:42:38 UTC**, duration 55 seconds. UI maps this source commit to the stable audit alias and `trainr-j2mnrtdh6-styleres-projects.vercel.app`. GitHub's Vercel status is success.
- Anonymous hosted retest: **16/16 PASS**, **13:42:58-13:43:02 UTC**, terminal exit 0. Health/database and public catalog contracts pass; catalog has zero trainers. Protected reads/writes return 401 and unsigned webhook returns 400. [Raw methods, routes, timestamps and results](CASH_REVIEW_PRESENCE_HOSTED_SMOKE.json). The script does not establish alias provenance (`aliasSourceIndependentlyVerified: false`); the separate UI verification above does.
- [Current GitHub CI run 38407044738](https://github.com/StylereTech/trainr/actions/runs/38407044738) failed. Fresh UI annotations for both check and migrations state: `The job was not started because your account is locked due to a billing issue.` Billing and runner settings were not changed. Local tests are not presented as hosted CI.
- Trainer signup was freshly rechecked: credentials remain blank and terms unchecked. No agreement was accepted or credential entered. Actual hosted trainer setup/Stripe payment/transfer/payout verification remains pending the existing owner handoff.

## Remaining Boundaries

**HOLD.** This fixes cash booking actions/projections, not every financial consumer. Cash checkout creation/release, account-checkout closure review presence, and package settlement replay need separate invariant audits. GitHub CI is account-billing-blocked in the previous fresh hosted evidence. Dependency advisory reachability/remediation, email, expiry/service-retirement policy and actual hosted Stripe checkout/Connect/transfer/payout proof remain open. No provider success is inferred from synthetic tests.
