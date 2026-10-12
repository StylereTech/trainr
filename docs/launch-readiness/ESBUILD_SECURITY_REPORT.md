# Build Tool File-Read Security Report

## Scope

- Date: 2026-10-12 UTC. Baseline `8cc966c4776c55456c81f10c0f67e4007bd3b6cb`, clean audit branch `codex/payment-readiness-20261006`.
- Environment: local Windows Node toolchain, owned disposable PostgreSQL and isolated audit Preview. Main, Production, Story, credentials and real funds excluded.
- Accounts: no real account involved in the security reproduction. All file contents are generated synthetic markers in a uniquely owned temporary directory. Temporary HTTP servers bind only to `127.0.0.1` and are disposed after each test.
- Expected: requests to an esbuild public directory must not read a sibling file; TypeScript imports, bundling, source maps, CLI scripts, migrations and app checks must remain compatible.

## Finding And Repair

Current npm evidence resolved both tsx and Vite to esbuild 0.27.4. The [upstream advisory](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr) describes Windows development-server path traversal and identifies 0.28.1 as patched. This is a build-tool finding, not evidence that TRAINR's hosted Next server exposes the vulnerable endpoint.

Five regression cases resolve the actual esbuild dependencies from each consumer, bundle TypeScript with relative imports/source maps, execute a tsx CLI script, and serve a synthetic public page while requesting an outside synthetic marker through raw/encoded backslash paths. The test does not read any real private file. Cleanup verifies the generated directory is a direct child of the temporary directory before removal.

Baseline at **09:06:03 UTC**: **three passed / two failed**, 3.77s, exit 1; `.postgres-test/esbuild-security-baseline.log`. Both consumer paths returned the outside synthetic marker for `/..\\private.txt`. This reproduced the advisory locally.

`npm update tsx esbuild --ignore-scripts --no-audit --no-fund` updated the lockfile to **tsx 4.23.15 / esbuild 0.28.2**, within existing package.json ranges; no override, forced major upgrade or advisory suppression. Current Vite 7.3.7 supports esbuild `^0.27.0 || ^0.28.0`, and tsx 4.23.15 requests `~0.28.0`. Installation changed three installed packages. Structured lockfile review found only tsx/esbuild/platform binary changes and metadata for tsx's former dependencies, not unrelated package upgrades. [Upstream patched release](https://github.com/evanw/esbuild/releases/tag/v0.28.2).

Unchanged focused retest at **09:07:33 UTC**: **five passed**, 2.34s, exit 0; `.postgres-test/esbuild-security-retest.log`. Both raw and encoded paths are denied, normal public reads still work, and the TypeScript compatibility cases pass. `npm ls esbuild tsx vite --all` passes and confirms both consumers use the patched resolution.

## Security Result

- Before: production audit **nine affected packages: five high, three moderate, one low**, exit 1; `.postgres-test/current-production-dependency-audit.json`.
- After: production audit **eight affected packages: five high, three moderate, zero low/critical**, exit 1; `.postgres-test/esbuild-security-audit-production.json`.
- After: full audit **ten affected packages: seven high, three moderate, zero low/critical**, exit 1; `.postgres-test/esbuild-security-audit-full.json`.
- esbuild is absent from the new audit findings. Braces and selector-parser dependency chains remain unresolved. Affected package counts are not distinct vulnerability counts; this is **not a clean security audit**.

## Verification And Publication

- `npm run check`: PASS, exit 0. Lint zero errors / 42 existing warnings, TypeScript, **1,413 units / 66 files** (61.26s, start **09:12:16 UTC**) and optimized 81-page build passed. Build compilation 38.1s, build TypeScript 44s; `.postgres-test/esbuild-security-check.log`.
- Focused test-file lint and full `npm ls --all --json`: PASS, exit 0. Dependency tree evidence: `.postgres-test/esbuild-security-dependency-tree.json`.
- Full SQL suite: **684 passed / 15 files**, 170.95s, start **09:16:31 UTC**, exit 0; `.postgres-test/esbuild-security-sql.log`. Provider responses are simulated; SQL persistence/concurrency and route guards are real local execution.
- Database setup correction: the first owned PostgreSQL start used default port 5432, so the intended 55439 connection was refused before any database tests. Restarted that same owned data directory explicitly on loopback port 55439; a fresh SQL read verified database `trainr_audit_timezone_20261011`, user `trainr_test` and `disposable integration database` guard. No production database was contacted.
- Compiled local browser regression: **46 passed**, 5.3m, exit 0; `.postgres-test/esbuild-security-browser.log`. Scope: six booking, eight Connect-status, eight dashboard and 24 package-history cases across 1440px/390px, both parent/trainer roles. Real local HTTP/SQL persistence with explicit simulated provider responses. This is a representative regression, not every existing browser spec or actual Stripe checkout/onboarding proof.
- Visually inspected desktop booking controls and mobile Connect status/error rendering. Local screenshots retained as `.postgres-test/esbuild-security-booking-desktop.png` and `.postgres-test/esbuild-security-connect-mobile.png`; all records/readiness are synthetic. No UI source or styling changed. Local app stopped after the browser run.
- Four migration rehearsals: **PASS**, exit 0; `.postgres-test/esbuild-security-migrations.log`. Fresh, legacy, phone-history and closed-account-history modes verified all 20 migration checksums, schema parity, no-op replay, SQL safeguards and preservation of 12 historical tables. Historical checkout targets remained PENDING without fabricated provider closure. All four owned rehearsal databases were removed.
- Independent post-browser SQL cleanup check confirmed the owned database/user/guard and zero users, bookings, payments, purchases, credit grants and checkout-closure tasks. Owned local app and PostgreSQL are stopped; required test processes finished.
- Publication status below. Unexecuted checks are not passes. Raw local logs are under `.postgres-test` and are intentionally not published as credential-bearing browser traces.

## Publication Blocker

Historical state captured at 09:29 UTC; the automatic deployment resolved the deployment delay below. The blocked manual action was never retried.

- Source **`0ded85ee0502e7c439144a90f83282d43e5833f4`** committed and pushed to the audit branch on 2026-10-12, approximately **09:28 UTC**. No main or Production push.
- [Current GitHub CI run 38230075242](https://github.com/StylereTech/trainr/actions/runs/38230075242): check and migrations did not start. Both current annotations state that the account is locked due to a billing issue. This is not a hosted test pass and no billing settings were changed.
- At **09:29:37 UTC**, the source commit's combined status returned no Vercel status. The Vercel deployment list still showed documentation commit `8cc966c` / Preview `7bXiYaUK6cVGCYopE3vRik7GTwys` as newest. Deployment of the new dependency lockfile is **unverified**, not Ready.
- Opening Vercel **Create Deployment** was stopped before execution by the approval service's HTTP 429 retry-limit failure. No CLI/API/alternate-browser deployment workaround was attempted. Requested owner guidance to retry for the audit Preview only; response pending.
- New-commit hosted smoke is **not run**, because a matching deployment is not established. Earlier Preview smoke results must not be relabeled as tests of this lockfile. Signed-in hosted access remains separately pending approval.
- Publication-evidence commit `bfb2e021a3743ca4a4f4a475596a1d5cfff663ca` was initially kept local, rather than using another push to circumvent the blocked deployment action. All tested security source and the initial verification report were already pushed at `0ded85e`.

## Automatic Deployment And Hosted Retest

- On the next read-only revalidation, GitHub reported Vercel success for **`0ded85ee0502e7c439144a90f83282d43e5833f4`**. Vercel independently shows audit Preview **`3da9rwGBkBXoASsqCh5pcx6vqWdT`**, matching source `0ded85e`, Ready **2026-10-12 09:31:42 UTC** after 1m 2s. The ordinary Git-triggered deployment completed without a manual deployment retry, alternate credentials or API/CLI workaround.
- Unique URL: `https://trainr-gpi50s2h8-styleres-projects.vercel.app`; the stable audit-branch alias points to this Preview. Build log confirms `Audit staging schema verified; migration checksums verified.` No Production migration or domain change occurred.
- Anonymous hosted smoke **09:33:08-09:33:12 UTC**: **12/12 PASS**, exit 0; `.postgres-test/esbuild-security-source-hosted-smoke.json`. GET `/api/health`: 200 and `dbConnected: true`. GET bookings, trainer/packages, trainer/wallet, package-purchases and admin/checkout-closures: 401. POST admin/refunds, package-purchases/refresh and admin/checkout-closures: 401. PATCH bookings/audit-nonexistent and admin/bookings: 401. Unsigned POST payments/webhook: 400. No cookies, valid webhook signatures or successful financial mutations were used.
- The manual deployment approval question is no longer needed for this source deployment. Signed-in Preview access is separately pending approval, and actual customer checkout/Connect/transfer/payout remains unverified. GitHub CI's billing blocker remains unresolved.
- Current source review reconfirms package-purchases has a GET history handler, no public purchase POST, and booking creation has no credit-redemption path. The history UI explicitly labels session credits unavailable. This is incomplete product behavior, not an external-only release blocker or a passed package flow.

## Remaining Gates

Package-credit expiry/restoration policy, atomic shared-child redemption and public buying remain unfinished. Signed-in hosted testing remains pending approval after the earlier browser approval-service rate limit. Actual sandbox customer checkout, trainer Connect, destination transfer and payout proof remain outstanding. GitHub CI billing, remaining dependency findings and all other launch gates remain open. Overall production/money-flow signoff: **HOLD**.
