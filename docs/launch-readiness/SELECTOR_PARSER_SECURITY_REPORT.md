# Selector Parser Security Verification

## Scope

- Date: 2026-10-12 UTC. Baseline `5547a14358a4265831e75234e69674d3dc1dcf30`, clean audit branch `codex/payment-readiness-20261006`.
- Environment: local Windows build tooling, synthetic selectors and owned disposable PostgreSQL. Publication target is isolated audit Preview only. Main, Production, Story and real funds excluded.
- Accounts: no account used for parser tests. Later application regressions use synthetic local fixtures only unless explicitly stated.
- Finding: [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf), patched in `postcss-selector-parser` 7.1.6. Installed Tailwind and postcss-nested both resolved 6.1.4. This is build-tool hardening; no attacker-controlled live TRAINR request path to this parser was demonstrated. The maintainer distinguishes untrusted synchronous selector parsing from ordinary trusted-source builds.

## Reproduction And Fix

At **10:47:12 UTC**, two bounded subprocess regressions each parsed a synthetic 200 KB flat selector containing 100,000 class nodes. Expected: complete under the five-second safety timeout with exact round-trip text and count. Actual: both 6.1.4 paths timed out and were terminated. **2 failed / 25 passed**, 11.39s, exit 1; `.postgres-test/selector-parser-baseline.log`. The other cases preserve representative escaped, responsive, state, relational and nested selectors. No hostile input was sent to a hosted service.

Pinned the transitive parser to 7.1.6 with an npm override. Final lockfile changes only this package's version, registry URL and integrity. No framework, styling, application behavior or schema change is intended.

An initial edit accidentally added a direct dev dependency rather than the override. That intermediate install was not accepted as a fix. Moving the pin to overrides then caused npm to omit the parser; the first retest failed loading the module before executing tests (`.postgres-test/selector-parser-retest.log`). A subsequent install reconciled it. Clean-install verification is required below before publication.

Focused retest **10:48:34 UTC**: **27 passed**, 2.59s, exit 0; `.postgres-test/selector-parser-final-retest.log`. Both large-selector cases finish; all round-trip and nested component cases pass.

Whole configured Tailwind output before/after: **84,735 bytes**, identical SHA-256 `483f154c8cf2d009a7138802a1f5d2e2ae8e8965599f7bf83ef18fe4825c8907`. Generated artifacts `.postgres-test/selector-css-before.css` and `selector-css-after.css`; comparison exited 0. This checks the complete configured Tailwind content scan, not every possible third-party selector.

## Release Gates

`npm ci --ignore-scripts` completed successfully after eight minutes of package downloads, exit 0 (`.postgres-test/selector-parser-ci.log`); the original process was retained throughout. Explicit local Prisma generation subsequently passed, exit 0 (`.postgres-test/selector-prisma-generate.log`). No migration was performed. The database identity/guard query verified `trainr_audit_timezone_20261011`, user `trainr_test`, and `disposable integration database` before application tests.

Current npm full audit lists **eight affected packages, all high severity**; production-only audit lists **six, all high severity**, audit exit 1. The selector-parser/postcss-nested advisory chain is absent. Remaining findings are the braces dependency chain; these are affected-package counts, not distinct vulnerabilities. Raw reports: `.postgres-test/selector-parser-audit-full.json` and `selector-parser-audit-production.json`. This is not a clean security audit.

Initial full quality gate passed lint but stopped at a type error in the new test's PostCSS import (`.postgres-test/selector-parser-check.log`, exit 2). Corrected the callable default-export type annotation; no application behavior changed. The new test file separately passes ESLint.

Final `npm run check`: **PASS**, exit 0 (`.postgres-test/selector-parser-check-final.log`). Lint zero errors / 42 existing warnings, TypeScript, **1,465 units / 67 files**, 36.36s, start **11:01:44 UTC**, and optimized 81-page build. Compilation 34.1s, build TypeScript 8.2s. Both parser paths were also confirmed at 7.1.6 by `npm ls postcss-selector-parser --json`, exit 0 (`.postgres-test/selector-parser-tree.json`).

Full SQL/API suite: **697 passed / 15 files**, 115.28s, start **11:04:12 UTC**, exit 0 (`.postgres-test/selector-parser-sql.log`). These exercise actual local SQL transactions and route behavior with synthetic provider responses, not hosted Stripe receipt proof.

Initial compiled Chrome run: **40 passed / 2 failed**, 3.2m, exit 1 (`.postgres-test/selector-parser-browser.log`). Both unlinked-account Connect cases expected `onboardingSupported: true`, but the app was started with empty Stripe configuration and correctly returned false. The process was stopped after the run and restarted with explicit fake local Stripe configuration; no real provider credentials were supplied. All 42 selected cases are being rerun without automatic retries. No test assertion was weakened to conceal the mismatch.

Final Chrome retest: **42 passed**, 3.2m, exit 0 (`.postgres-test/selector-parser-browser-final.log`), one worker and no automatic retries. Booking layout/empty states/name boundaries ran at 320/390/1024/1440px; Connect readiness/error states and parent/trainer package history ran at 1440/390px. Routes include `/book/[slug]`, `/trainer/dashboard`, `/trainer/profile?tab=payouts`, `/parent/packages`, `/trainer/purchases`, `/api/payments/connect` and `/api/trainer/stripe-connect`. History refresh success, uncertainty, malformed responses and read/provider errors were exercised with explicit simulated provider data. This is a representative regression selection, not a new all-file browser run or actual paid Stripe checkout proof.

Visually inspected fresh [1440px](screenshots/selector-parser-booking-1440.png) and [390px](screenshots/selector-parser-booking-390.png) booking screenshots. Long service/athlete labels, maximum synthetic price, selected date/time, summary and payment controls remain readable without overlap or horizontal overflow. All displayed data is synthetic.

Independent final SQL cleanup: expected database/user/guard and zero users, bookings, payments, package purchases, credit grants and checkout-closure tasks; exit 0 (`.postgres-test/selector-cleanup.log`). Owned local app and PostgreSQL stopped. No migrations changed; no new migration rehearsal is claimed. `git diff --check` passed.

Publication evidence is pending. No pending check is a pass. Package-credit expiry/restoration policy, atomic shared-child redemption, public buying and actual hosted customer/trainer Stripe checkout, Connect, transfer and payout proof remain unfinished. Signed-in hosted retry approval and GitHub billing remain external blockers. Overall production/money-flow signoff: **HOLD**.
