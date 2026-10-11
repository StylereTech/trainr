# Dependency Security Report

2026-10-11 follow-up: [hydration diagnosis and candidate framework fix](HYDRATION_READINESS_REPORT.md). Correction to the development-test entry below: the temporary custom server did not honor the intended separate build directory; it wrote to `.next`. The development results remain valid, but output isolation was not achieved. A fresh production baseline build preceded the follow-up reproducer. Earlier production failures remain recorded.

## Scope And Baseline

- Date: 2026-10-11, baseline captured approximately 13:05 UTC.
- Baseline commit: `47d7787e0bb2bbd6e3308e42d4dc151904aef6eb`.
- Branch/environment: `codex/payment-readiness-20261006`, isolated TRAINR audit Preview and Windows loopback test server; Node 22.23.1. Main, Production project `trainr-node`, Story, credentials and deferred email setup are unchanged.
- Accounts: disposable local parent/trainer/admin fixtures; existing owner-authenticated Preview PARENT for read-only hosted smoke. No real provider payment, transfer, payout, or account creation is performed by these dependency checks.
- Expected: no affected critical dependencies; lint/type/unit/build, SQL and browser regressions continue to pass. A passing build is not a clean security audit or completed money-flow signoff.

## Findings And Fixes

`npm audit --json` at baseline returned exit 1, with 30 affected packages: 4 critical, 19 high, 6 moderate and 1 low. These are dependency findings, not 30 distinct vulnerabilities or evidence of exploitation. Raw local evidence: `.postgres-test/dependency-audit-current.json`.

| Component | Baseline installed | Updated installed | Fix rationale |
| --- | --- | --- | --- |
| Next.js | 15.5.15 | 15.5.27 | Patched framework/security line, remaining on major 15 |
| NextAuth | 4.24.14 | 4.24.15 | Patched authentication release, remaining on major 4 |
| Vitest | 3.2.4 | 4.1.11 | Removes affected tinypool chain and includes mocker fixes |
| Vite | 7.3.2 | 7.3.7 | Compatible patched major-7 override |
| PostCSS | 8.5.8 | 8.5.29 | Explicit major-8 override also replaces Next's pinned older transitive version |
| sharp | 0.34.5 | 0.35.5 | Next 15.5.27 explicitly supports this optional dependency line |

Updated matching `eslint-config-next` and compatible transitive packages through npm. No `npm audit fix --force`, framework downgrade, advisory suppression, or test assertion removal was used. Package-lock records exact resolutions.

Primary references: [Next Windows RCE advisory](https://github.com/advisories/GHSA-p293-qw3h-jr36), [NextAuth email normalization advisory](https://github.com/advisories/GHSA-7rqj-j65f-68wh), [NextAuth malformed authorization advisory](https://github.com/advisories/GHSA-xmf8-cvqr-rfgj), [tinypool advisory](https://github.com/advisories/GHSA-85c8-ppgw-ccpr), [Vitest 4.1.11 release](https://github.com/vitest-dev/vitest/releases/tag/v4.1.11), and [Vitest migration guidance](https://v4.vitest.dev/guide/migration).

TRAINR uses CredentialsProvider, not NextAuth EmailProvider. The upstream magic-link issue is not presented as a reproduced vulnerability in TRAINR's separate verification-email implementation. No exploit against hosted services was attempted.

Initial npm installation failed resolving the `$postcss` override reference. Replacing it with the explicit matching range succeeded; the failed attempt is retained in `.postgres-test/security-dependency-install.log`, retry in `security-dependency-install-retry.log`. An inventory run during the subsequent npm update saw an incomplete sharp installation; the post-update inventory passed and resolved sharp 0.35.5. This was not a deployed application failure.

## Remaining Security Work

Post-update `npm audit --json` still exits 1: **14 affected packages, 0 critical, 10 high, 3 moderate, 1 low**. Evidence: `.postgres-test/security-audit-final.json`; compatible-fix output: `security-compatible-fixes.log`. Status: improved, **not clean / not production security signoff**.

- [braces stack exhaustion](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm): unresolved through Tailwind 3, micromatch, fast-glob, chokidar and Next ESLint chains. Current audit reports all braces releases affected. Do not accept npm's suggested ESLint-major downgrade simply to hide the chain.
- [deepmerge-ts recursive graph exhaustion](https://github.com/advisories/GHSA-ggr8-5vv4-36mx): unresolved through Prisma CLI configuration. A major dependency override or Prisma migration requires separate compatibility validation; npm's suggested older Prisma is not applied.
- [selector parser CPU exhaustion](https://github.com/advisories/GHSA-rj75-hqrm-r3gf): Tailwind 3 / postcss-nested still resolves parser 6.1.4; fixed upstream line is 7.1.6 or later. Requires a tested build-tool migration or compatible backport.
- [esbuild Windows development-server traversal](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr): Vite/tsx currently resolve 0.27.4; upstream fix starts at 0.28.1. A cross-minor tool update remains to test. No esbuild file-serving server is enabled in this audit.

These chains appear in build/test/configuration tools, and a source search found no direct imports of the affected packages in application routes or scripts. Nevertheless, `npm audit --omit=dev --json` also exits 1 and reports 12 affected packages (8 high, 3 moderate, 1 low) through inherited/peer dependency classification; evidence is `.postgres-test/security-audit-production-dependencies.json`. They must not be dismissed as dev-only. A structured inspection of the rebuilt `.next/server/**/*.nft.json` traces found no file references to braces, deepmerge-ts, postcss-selector-parser, esbuild or micromatch. This is a limited trace/reachability observation, not proof that all bundled/runtime exposure is impossible. Untrusted code, CSS or glob configuration must not be processed by these tools. Repository-side work remains; these are not all external blockers.

## Verification

New loopback-only session cases send five malformed Bearer values to GET `/api/bookings` and the protected parent, trainer and admin pages. Expected results: API 401, pages 307 to `/auth/signin`, never 500. Existing credential-login, password reset/session revocation and role-boundary assertions remain intact. These are advisory-based regressions; no pre-upgrade exploit reproduction is claimed.

| Check | Actual result | Status / evidence |
| --- | --- | --- |
| `npm run check` | Lint and type checking passed with existing lint warnings; 1,290 unit tests / 60 files passed; optimized 76-page build completed, exit 0 | PASS; `.postgres-test/security-check.log` |
| `npm run test:postgres` | 396 tests / 12 files passed, 138.85s, exit 0 | PASS; `.postgres-test/security-sql.log` |
| Focused malformed-header regression | 5 passed, 3.6s, exit 0; 20 anonymous requests to one API and three protected page routes | PASS; `.postgres-test/security-auth-focused.log` |
| `npm ls --all --json` | Full installed dependency tree validates, exit 0 | PASS; `.postgres-test/security-dependency-tree.json` |
| Complete local browser regression matrix | 249 passed, 1 failed / 250 cases across 32 local-only files, 25.3m, exit 1 | FAIL; `.postgres-test/security-browser.log`; hydration defect below |

SQL and browser cases use database `trainr_audit_timezone_20261011`, role `trainr_test`, with the disposable-database guard. The browser server binds only to `127.0.0.1:3108`, with a local-only auth secret and a nonfunctional fake Stripe key. Runtime `VERCEL=1` is used only on loopback so the trusted-forwarded-header rate-limit fixture can exercise the existing production branch. No hosted trust setting was changed. Browser cases mix real local SQL/HTTP persistence with explicitly intercepted provider/error fixtures; no case establishes an actual provider payment or payout. Cleanup and publication evidence will be recorded after completion.

### Open Hydration Defect

The 390px trainer-approval stale-decision case completed its load/retry, revision rejection, review dialog, rejection action and reload assertions, then failed its existing `pageerror` assertion. The captured error was React 418, emitted after the final `/admin/trainers` reload. [React's error reference](https://react.dev/errors/418) identifies a server/client hydration mismatch. No cause or dependency attribution is established by this one observation. Do not suppress the assertion or call the full browser matrix green.

Evidence: `.postgres-test/security-browser-results/trainer-approval-local-reg-b18a6-s-and-stale-decisions-390px-chromium/error-context.md`, `trace.zip`, `test-failed-1.png`, and the full browser log. Same-build repeated desktop/mobile approval tests returned **19 passed, 1 failed**, 2.6m, exit 1 (`.postgres-test/security-approval-repeat.log`). The second failure was the same React 418 assertion at 1440px, repeat 6; its trace is in `security-approval-repeat-results/trainer-approval-local-reg-57aaf--and-stale-decisions-1440px-chromium-repeat6`. Thus the issue is not restricted to mobile. A separate development server on loopback 3109 with isolated build output ran the same cases ten times: **10 passed**, 3.2m, exit 0 (`.postgres-test/security-approval-dev.log`), without reproducing the page error. No application code or error assertion was changed to obtain those passes. Successful repeats do not erase either production-mode failure or prove a fix. Status: open, not an external blocker; trace-based root-cause diagnosis remains required.

Selected rebuilt [desktop booking](evidence/dependency-security-20261011/desktop-booking.png) and [mobile booking](evidence/dependency-security-20261011/mobile-booking.png) screenshots were opened, visually inspected and copied unmodified. The inspected controls and wording fit these viewports. These synthetic fixtures verify rendering, not an actual Stripe checkout. The copy promising messaging after payment still requires end-to-end validation; messaging routes and UI do exist, so an empty hosted inbox must not be mistaken for absence of an implementation.

## External CI Blocker

Fresh authenticated GitHub read for [run 38141366686](https://github.com/StylereTech/trainr/actions/runs/38141366686), source `47d7787e0bb2bbd6e3308e42d4dc151904aef6eb`, shows failure before check/migrations jobs execute. The check annotation says: "The job was not started because your account is locked due to a billing issue." Vercel's success status is separate and does not establish a successful GitHub Actions run. Owner billing resolution is required; no billing settings were changed.

## Release Decision

**HOLD.** The hydration defect, hosted trainer onboarding, real Stripe sandbox booking/transfer/payout, package purchase/credit lifecycle, unpaid-hold policy, remaining security warnings and other release gates remain incomplete or unverified. Stripe's sandbox connected-account page showed a loading state and later browser control timeouts on this pass; no fresh account count is claimed. Existing parent authentication does not establish trainer functionality.

## Cleanup And Publication

Independent psql readback after all tests verified the disposable database name, `trainr_test` role and guard marker, then zero users, bookings, payments, packages, package items, services, sports, Connect attempts, checkout attempts, refunds, wallet entries and withdrawal requests. Both owned local app servers are stopped; the PostgreSQL instance was stopped after verification. No hosted records were deleted. Temporary diagnostic scripts, raw logs and traces remain local and ignored by Git.

Only the dependency patch, five added authorization regressions, this report, the final-report pointer and two synthetic screenshots were committed. Preview publication is not a production release or a passing full-browser quality gate.

### Published Source And Hosted Retest

- Source commit `295bfb543d9f852dbaa1602ec911659cabe7d62d`, `security: patch critical framework and test dependencies`, pushed only to the audit branch. Worktree was clean after the source push.
- Vercel [deployment A2UH8zQiwxAEyGcFGfBWc96Sa32L](https://vercel.com/styleres-projects/trainr/A2UH8zQiwxAEyGcFGfBWc96Sa32L) verified Ready on exact source `295bfb5`, build duration 1m19s. UI verified both `trainr-ke41wp3hr-styleres-projects.vercel.app` and the stable audit branch alias. The GitHub Vercel commit status independently reported success. A stalled Vercel browser tab required a fresh tab before the Ready state could be observed; no redundant deployment was requested.
- At 14:00:00-14:00:01 UTC, anonymous GET `/api/bookings`, `/api/trainer/onboarding`, `/api/payments/connect` and `/api/admin/users` each returned the expected 401. No credentials or financial data were submitted.
- Existing owner-authenticated PARENT refreshed `/parent/dashboard`: one saved Sandbox Athlete, zero bookings, session retained. Direct navigation to `/trainer/profile` and `/admin` redirected back to the parent dashboard. These hosted checks passed only for parent persistence/read access and role boundaries, not for a trainer's form, Stripe checkout or payouts.
- [GitHub Actions run 38145111111](https://github.com/StylereTech/trainr/actions/runs/38145111111), exact source `295bfb5`, failed before either job started (zero steps). Fresh check annotation again identifies an account billing lock. Local check success and Vercel Ready must not be relabeled GitHub CI success.
- Main, Production domains/project, Story, account roles, email setup and provider financial state were not changed. This documentation follow-up changes no application source. Release decision remains **HOLD**.
