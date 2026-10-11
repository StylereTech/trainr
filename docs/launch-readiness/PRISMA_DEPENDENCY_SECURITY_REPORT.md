# Prisma Dependency Security Follow-Up

## Scope And Baseline

- Date/time: 2026-10-11, baseline and focused retest approximately 16:14-16:17 UTC.
- Baseline source: `84f50fd0165c6c189d0d1cac3397b4632bcf769c`, branch `codex/payment-readiness-20261006`.
- Environments: Windows Node 22 loopback tests and isolated audit Preview. Main, Production project/domains, Story, credentials and deferred email setup are unchanged.
- Accounts: local disposable fixture users and existing owner-authenticated Preview PARENT. Stripe observations are read-only in Style.re sandbox, not the live account.
- Expected: remove the affected Prisma configuration dependency while retaining configuration loading, generation, migrations and application behavior. This is not full production or money-flow signoff.

## Reproduction And Fix

The baseline full npm audit reports 14 affected packages: 0 critical, 10 high, 3 moderate and 1 low. These are package-chain findings, not 14 distinct vulnerabilities. Evidence: `.postgres-test/dependency-followup-baseline.json`.

`@prisma/config@6.19.3` pins `deepmerge-ts@7.1.5`. Its actual loader imports `deepmerge` and supplies it to c12. It disables remote extension, RC, dotenv and package-json merging. [The upstream advisory](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) covers recursive object graphs, not ordinary JSON. No remote exploit against TRAINR is claimed or attempted.

Seven new regression tests resolve the transitive package from Prisma itself, exercise CJS/TypeScript config files, default discovery, explicit missing-file errors, nested records/arrays and two circular graph operations. Baseline: **5 passed, 2 failed** with `RangeError: Maximum call stack size exceeded` in both `deepmerge` and `deepmergeInto`. Evidence: `.postgres-test/prisma-config-baseline.log`.

Added a narrowly scoped npm override under `@prisma/config` to exact `deepmerge-ts@8.0.2`. The [v8 release notes](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0) document circular-reference support and changed Map/into behavior; Prisma's record configuration path is covered by real loader regressions. The registry package supports both CommonJS and ESM and Node >=16.9. No Prisma major migration, advisory suppression, force fix or downgrade was used. Installation changed exactly one package. Retest: **7 passed**, exit 0, `.postgres-test/prisma-config-retest.log`.

## Security Result

- Full `npm audit --json`: exit 1, **11 affected packages: 0 critical, 7 high, 3 moderate, 1 low**. Evidence: `.postgres-test/prisma-security-audit.json`.
- `npm audit --omit=dev --json`: exit 1, **9 affected packages: 0 critical, 5 high, 3 moderate, 1 low**. Evidence: `.postgres-test/prisma-security-audit-production.json`.
- `npm ls deepmerge-ts @prisma/config --all`: exit 0, Prisma 6.19.3 resolves the scoped override to 8.0.2.
- The Prisma/deepmerge advisory chain is removed from the audit output. Remaining braces, selector-parser and esbuild chains are not waived or classified as harmless. This audit is **not clean**.
- Fresh registry read still lists braces 3.0.3 as latest; esbuild 0.28.2 is available for separate compatibility review. No other dependency is changed in this pass.

## Application Verification

| Check | Actual result | Evidence |
| --- | --- | --- |
| `npm run check` | PASS, exit 0: lint/type checking, 1,297 tests in 61 files and optimized production build; 43 existing lint warnings remain | `.postgres-test/prisma-security-check.log` |
| `npm run test:migrations -- --integration` | PASS, exit 0: fresh, legacy and existing-phone-history paths; 13 migration checksums/safeguards, schema parity, no-op replay, preservation of 12 legacy tables and intended token/default changes | `.postgres-test/prisma-security-migrations.log` |
| SQL integration on freshly migrated schema | PASS: 396 tests in 12 files, 88.33s, exit 0 | Same migration log |
| Full installed dependency tree | PASS: `npm ls --all --json`, exit 0 | `.postgres-test/prisma-security-dependency-tree.json` |
| Full local browser matrix | **FAIL**: 259 passed, 1 failed, 27.2m, exit 1; no skips | `.postgres-test/prisma-security-browser.log` |
| Unchanged focused permission/recovery repeat | PASS: 20 passed, 2.1m, exit 0; ten runs at each width, no retries | `.postgres-test/prisma-security-package-repeat.log` |

The migration rehearsal removed its three individually owned disposable databases; independent psql inspection found zero remaining `trainr_audit_migration_%` databases. Both the application server and local PostgreSQL instance are stopped after the final repeat and cleanup check.

### Browser Failure And Investigation

The 1,440px `package list failure and parent denial` case completed its error, disabled-action and reload assertions, then failed at the parent GET `/api/trainer/packages` with `apiRequestContext.get: read ECONNRESET`, before any HTTP status was returned. It did not return an incorrect authorization decision. The mobile equivalent and all other cases passed. Captured server output contained expected deferred-email notices and no matching exception; that does not prove the cause of the reset.

Raw failure screenshot, context, video and trace remain local in `.postgres-test/prisma-security-browser-results/trainer-packages-local-reg-10680-re-and-parent-denial-1440px-chromium/`. Raw logs/traces include disposable session data and are not committed. The unchanged test passed all 20 repeats, ten at each width, with retries still disabled. No assertion was removed, retry wrapper added or application fix claimed for this transport event. It did not reproduce in this bounded follow-up; root cause remains unproven, not a proven external dependency. A focused pass cannot retroactively make the full run green. Further full-run observation remains required before release.

The rebuilt application's 90 server file traces contain no references to `deepmerge-ts` or `@prisma/config`. This is limited trace evidence, not proof of absent bundled/runtime exposure or a proven explanation for the connection reset.

Desktop parent and mobile trainer dashboard screenshots from this run were visually inspected. Visible controls and labels fit; all shown users, bookings and balances are synthetic. Local evidence: `dashboard-local-regression-027b9-d-reloads-persisted-actions-chromium/dashboard-top.png` and `dashboard-local-regression-130d6-d-reloads-persisted-actions-chromium/dashboard-top.png` beneath the browser-results directory. No UI styling changed in this dependency patch.

The local PostgreSQL guard was independently verified: database `trainr_audit_timezone_20261011`, role `trainr_test`, marker `disposable integration database`, bound to `127.0.0.1:55439`. Local test secrets and fake Stripe values cannot make provider payments. No hosted records are deleted by local fixtures.

## Hosted Readback Before Publication

At approximately 16:14-16:19 UTC on the baseline Preview:

1. Read `/parent/dashboard`: existing parent signed in, one saved Sandbox Athlete and zero bookings. PASS for session/read access only.
2. Clicked Find Trainers to `/browse`, then Clear Filters: filter chip cleared, **0 trainers found** remained. PASS for navigation/clear-filter behavior; BLOCKED for actual trainer selection and paid booking.
3. Read Stripe sandbox `/test/connect/accounts`: sandbox banner, **All 0**, **Enabled 0**, **No connected accounts**. This supersedes the earlier loading-only observation, not any real onboarding proof.
4. At approximately 16:23 UTC, clicked Notifications, waited for `/notifications`, selected Unread and waited for loading to finish: 0 unread, No unread notifications, and Mark page read disabled. PASS for hosted navigation/filter/empty-state handling, not notification delivery.
5. Later in the same baseline session, opened navigation and clicked Messages: `/messages` loaded with zero conversations/unread messages and the menu closed. PASS for navigation and empty-state rendering only; message delivery is not verified.

The notification view was visually inspected at the actual 1,243px browser width: Inter font family, readable controls and no horizontal overflow (`scrollWidth=1228`). The browser capability accepted a 390px request but DOM width and screenshot remained 1,243px; the override was reset. This is **not** hosted mobile proof. The automated local suite explicitly uses both 390px and 1,440px viewports.

Asked the owner whether a separate trainer test login already exists. Actual hosted trainer onboarding, booking/checkout, webhook settlement, destination transfer and payout remain unverified. Package purchase/credit lifecycle and other release gates remain open. Email setup remains deferred as requested. Overall **HOLD**.

## Publication And Cleanup

After the final repeat, independent psql readback reconfirmed the database/role/guard and zero users, bookings, payments, packages, package items, services, sports, Connect attempts, checkout attempts, refunds, wallet entries and withdrawal requests. No hosted records were deleted. Raw logs, traces and screenshots remain local and ignored. The owned app server was stopped with Ctrl-C; PostgreSQL stopped cleanly.

Pending scoped audit-branch commit/push, Ready deployment and hosted retest. Publication of this narrowly tested security improvement does not establish a full browser-suite pass or production release. Main, Production and Story remain untouched.
