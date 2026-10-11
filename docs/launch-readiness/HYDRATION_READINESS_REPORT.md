# Hydration Readiness Report

Updated 2026-10-11 15:26 UTC: the observed hydration defect is fixed and locally retested. The final clean-build browser run passed all 252 cases. Source `ccce0074b7e744b48bbf4a54b033d555ed396d85` is pushed and Ready on audit Preview, with the limited hosted smoke below passing. Overall production readiness remains **HOLD**.

## Scope And Failed Baseline

- Date/time: 2026-10-11, diagnosis and migration beginning approximately 14:05-14:17 UTC.
- Baseline commit: `6c0d1301e81d879d1014e0f2e73063093b09fad3`.
- Environment: isolated audit checkout, branch `codex/payment-readiness-20261006`; Windows/Node 22.23.1; optimized production server on `127.0.0.1:3108`. Disposable PostgreSQL database `trainr_audit_timezone_20261011`, role `trainr_test`, explicit disposable guard. No Production, main, Story, credentials or live financial changes.
- Account: generated disposable ADMIN authenticated through the guarded local fixture. The existing hosted owner session remains PARENT; hosted admin access is not claimed.
- Route: `/admin/trainers`, with real local HTTP/SQL rather than mocked approval responses.
- Steps: sign in; load approvals at 1440px or 390px; wait for the empty-state and authenticated navigation; reload ten times; assert no page errors or hydration console errors after each render. Three repeats per width.
- Expected: identical server/client hydration, usable page after every reload, no React errors.
- Actual baseline: **3 failed, 3 passed (1.2m)**. Failures at both widths reproduced React 418. Prior full-suite failure (249/250 passing) and repeated workflow failure (19/20 passing) remain valid, not erased by successful repeats.
- Evidence: `.postgres-test/hydration-reload-baseline.log`, `hydration-reload-baseline-results/*/trace.zip`, and optional `hydration-debug.json` attachments. Raw traces stay ignored/local because diagnostic captures may contain rendered account data.

The loopback server uses a local-only auth secret and nonfunctional `sk_test_local_ui_only_not_real`, with `VERCEL=1` solely to exercise the existing forwarded-header rate-limit branch locally. Browser fixtures require explicit loopback `BASE_URL`, `LOCAL_E2E_SECRET`, the disposable `TEST_DATABASE_URL` and `TRAINR_ALLOW_DB_TESTS=1`. No hosted trust setting or financial credential is changed.

## Diagnosis

The optional loopback-only CDP observer captured the throw without changing the application's renderer or suppressing its error. At the mismatch, React expected the admin layout's outer `DIV`, its hydration-parent fiber was that same `DIV`, and the next hydratable DOM node was the existing child `ASIDE`. This is consistent with replaying a host fiber after its cursor has already advanced into its children.

This observation matches the mechanism in [React issue 37584](https://github.com/react/react/issues/37584). The upstream [fix 35494](https://github.com/react/react/pull/35494) restores hydration position before host-fiber replay. Attribution is based on captured cursor state and upstream source; it is not a claim that every hydration error has this cause.

Next 15.5.27 is the latest registry backport release observed during this pass and still bundles the affected renderer. Installing React alone does not replace the App Router's bundled renderer. The fix upgrades to stable Next 16.4.0 and React/ReactDOM 19.3.0. The installed Next renderer identifies itself as `19.3.0-canary-278794d7-20261002`; its `replaySuspendedUnitOfWork`, host tag 5, visibly restores `nextHydratableInstance` from the fiber's `stateNode`. The same renderer version is present in the clean build's browser chunks, including `4bd1b696-8cd12253b448cc13.js`. No hand-written node_modules patch or hydration-warning suppression is used.

## Compatibility Changes

- Preserve Webpack explicitly in both development and production build scripts; no simultaneous bundler migration.
- Replace removed `next lint` with ESLint CLI and the maintained flat Next configuration, retaining the project's existing four rule exceptions. The initial check stopped at 19 newly introduced compiler-rule errors (15 effect-state, three immutability and one ref diagnostic), plus 24 existing warnings. These three newly introduced rule families are retained as warnings during migration, not removed: the lint retest reports zero errors and 43 warnings. Existing error-level rules are unchanged. This is explicit lint debt, not a claim that those component patterns were repaired or that lint is warning-free.
- Preserve Edge middleware and server-side role guards; do not blindly rename middleware to Node-only proxy.
- No caching opt-in, database schema, payout policy or provider configuration change.
- Retain Next's required TypeScript automatic JSX runtime and separate development type include. The generated route listings contain the same 89 routes before and after the upgrade; the static-generation counter changed from 76 to 75 without a removed route.
- Run `next typegen --webpack` before `tsc --noEmit` so the gate validates freshly discovered routes instead of depending on generated files from an earlier build. This is a preventive clean-checkout safeguard, not a reproduced application defect.
- Follow [Next 16 migration guidance](https://nextjs.org/docs/app/guides/upgrading/version-16). Verification remains mandatory before publication.

## Evidence Correction

The previous dependency report described the temporary development diagnostic as having isolated build output. Fresh filesystem inspection found that its custom-server setting was not honored: `.next` held development output and the proposed separate directory did not exist. The development tests still passed, but output isolation was not achieved. The earlier production test runs preceded that development server, so their failures remain valid. This pass stopped that server and completed a fresh baseline production build before the new reproducer. Do not reuse the temporary development launcher.

## Verification And Release Status

The upgrade installed successfully. Fresh dependency audit still reports 14 affected packages (0 critical, 10 high, 3 moderate, 1 low), exit 1; these are not waived. `npm ls --all --json` validates the dependency tree, exit 0. Both outputs are retained under `.postgres-test/hydration-framework-*.json`.

The separate `npm audit --omit=dev --json` also exits 1, with 12 affected packages (0 critical, 8 high, 3 moderate, 1 low). A parsed inspection of all 90 server `.nft.json` traces found zero file references to braces, deepmerge-ts, postcss-selector-parser, esbuild or micromatch. This is limited trace evidence, not proof of absent bundled/runtime exposure. An initial PowerShell read treated bracketed dynamic-route names as wildcards; its partial result was discarded, and the successful check used literal paths with stop-on-error.

| Check | Actual result | Status / evidence |
| --- | --- | --- |
| Initial full check | Stopped at 19 newly introduced compiler lint errors | FAIL; `hydration-framework-check.log`; explicit compatibility policy above |
| Full check retest | Lint completed with 43 warnings; typecheck passed; 1,290 unit tests / 60 files passed; optimized production build and 89-route inventory completed, exit 0 | PASS with warnings; `hydration-framework-check-retest.log` |
| SQL integration suite | 396 tests / 12 files passed, 96.75s, exit 0 | PASS; `hydration-framework-sql.log` |
| Fresh route-type gate | `next typegen --webpack` then `tsc --noEmit` completed, exit 0 | PASS; `hydration-framework-fresh-types.log` |
| Relative redirect assertion retest | Five malformed Bearer cases passed, 10.7s, exit 0; API 401 and all three protected-page 307 responses retained | PASS; `hydration-relative-redirect.log` |
| Repeated production reloads | 20 passed (4.1m), exit 0; ten repetitions at each width, 220 authenticated page renders, optional CDP diagnostics disabled; original error assertions intact | PASS; `hydration-framework-repeat.log` |
| First full local browser matrix | 247 passed, 5 failed / 252 cases, 22.5m, exit 1; all failures are relative-redirect URL parsing in the test | FAIL; `hydration-framework-browser.log`; correction and focused retest below |
| Empty-build full check | Fresh route types, typecheck, 1,290 unit tests / 60 files, optimized production build completed, exit 0; same documented warnings | PASS; `hydration-framework-clean-check.log`; generated `.next` and `next-env.d.ts` were moved to an ignored, path-verified in-workspace backup before the command |
| Complete corrected browser rerun | 252 passed / 33 files, 21.3m, exit 0; no skipped or failed cases | PASS; `hydration-framework-browser-retest.log` |
| Publication / hosted retest | Source `ccce0074b7e744b48bbf4a54b033d555ed396d85` pushed; Preview Ready; eight anonymous HTTP checks and authenticated parent refresh/role-denial/catalog smoke passed | PASS for this limited scope; exact results below, not money-flow signoff |

Build warnings include retained Edge middleware deprecation and Node API references in Next's own Edge import graph. No application import was added to middleware. The compiled local browser suite passed its real credential, revocation, malformed-header and role-boundary cases. Hosted compatibility is recorded separately; the warnings are not represented as repaired application code.

Focused command: `npx playwright test e2e/trainer-approval-reload-local-regression.spec.ts --repeat-each=10 --workers=1 --reporter=list`. First full browser command: `npx playwright test 'local.*\.spec\.ts$' --workers=1 --reporter=list`. The corrected complete rerun invoked the same installed CLI directly: `node node_modules/@playwright/test/cli.js test 'local.*\.spec\.ts$' --workers=1 --reporter=list`. These use the guarded environment above and dedicated ignored output directories. The full suite uses generated disposable PARENT, TRAINER and ADMIN accounts, real local persistence and separately mocked provider/failure responses; it does not establish an actual hosted checkout, transfer or payout.

Fresh [mobile booking](evidence/hydration-20261011/mobile-booking.png) and [desktop booking](evidence/hydration-20261011/desktop-booking.png) screenshots were opened and inspected, then copied unmodified. The captured booking controls and text fit the visible portions of these viewports. These are scrolled viewport captures, not complete-page accessibility certification or evidence of a provider transaction. Copy promising post-payment notification/messaging still needs the real end-to-end money-flow validation.

The original trainer approval stale-decision/rejection/reload workflow passed at both widths on the new renderer. Its [desktop approval dialog](evidence/hydration-20261011/desktop-approval.png) and [mobile approval dialog](evidence/hydration-20261011/mobile-approval.png) were opened and visually inspected: the displayed reason, close, cancel and reject controls fit without text overlap. Full-page captures include off-viewport content beyond the fixed modal backdrop; that capture behavior is not reported as a live overlay defect.

### Redirect Test Compatibility

The first full browser run exposed five test failures in `session-local-regression.spec.ts`, not five authorization bypasses. The captured trace reports `TypeError: Invalid URL` at the old one-argument `new URL(location)` assertion. Fresh anonymous probes independently returned API 401 and protected-page 307; Next 16 emits a valid relative `Location`, such as `/auth/signin?callbackUrl=%2Fparent%2Fdashboard`.

The test now resolves Location against the explicitly guarded loopback base and additionally asserts the destination origin and original callback path. Status and sign-in-path assertions remain intact; no authentication application code, error handling or access policy was relaxed. All five focused cases passed. The first full run and the complete corrected rerun must be recorded separately, not combined into a fictional single green run.

Overall **HOLD**. Hosted trainer onboarding and actual Stripe sandbox payment/transfer/payout, package purchase/credit lifecycle, unpaid-hold policy, remaining dependency findings and the external GitHub Actions billing lock remain separate open gates.

## Cleanup

At 15:18 UTC, independent psql readback verified the disposable database name, `trainr_test` role and exact guard marker. Counts were zero for users, parent/trainer/athlete profiles, bookings, payments, packages/items, services, sports, Connect/checkout attempts, refunds, trainer wallets, wallet entries and withdrawal requests. Owned app servers and the PostgreSQL instance are stopped. Only the generated first-build/type backups were removed after absolute-path and reparse-point checks; raw logs/traces and the clean build remain local and ignored. No hosted record was deleted. Local password-reset email-unavailable messages are expected in the provider-disabled fixture environment; real email delivery remains unverified/deferred.

## Publication And Hosted Retest

Source `ccce0074b7e744b48bbf4a54b033d555ed396d85` was committed and pushed to `codex/payment-readiness-20261006` at approximately 15:20 UTC. Local HEAD and the remote-tracking branch matched, with a clean worktree before this evidence update. Vercel Preview deployment [DZ7jXx1gsc8h6fwDHhAg9WHvrs4Q](https://vercel.com/styleres-projects/trainr/DZ7jXx1gsc8h6fwDHhAg9WHvrs4Q) became Ready at 15:24:33 UTC, duration 1m 13s. The detail page identifies the exact source and both the unique `trainr-16ias0dow-styleres-projects.vercel.app` URL and [stable audit Preview](https://trainr-git-codex-payment-readiness-20261006-styleres-projects.vercel.app). No Production promotion or domain/security-setting change was made.

Fresh [GitHub Actions run 38150886788](https://github.com/StylereTech/trainr/actions/runs/38150886788) failed before execution: both `check` and `migrations` have zero steps, and the authenticated run page states, "The job was not started because your account is locked due to a billing issue." This is an external CI execution blocker, not a passing remote check or a reproduced code failure. Billing settings were not changed. The connector rejected the check-annotations endpoint, so the annotation was independently read from the run's browser UI.

Hosted retest, 15:24:58-15:26 UTC, stable alias above, source `ccce0074b7e744b48bbf4a54b033d555ed396d85`:

| Account / exact steps | Expected | Actual | Result |
| --- | --- | --- | --- |
| Anonymous GET `/`, `/browse`, `/auth/signin` | HTTP 200 | All three HTTP 200 | PASS availability only |
| Anonymous GET `/api/bookings`, `/api/trainer/onboarding`, `/api/payments/connect`, `/api/admin/users` | HTTP 401 | All four HTTP 401, `Unauthorized` | PASS |
| Anonymous POST `/api/payments/webhook`, JSON `{}`, no signature | HTTP 400 before provider processing | HTTP 400, `Missing stripe-signature header` | PASS; no valid event or financial mutation |
| Existing owner PARENT browser session: reload `/parent/dashboard` | Session and saved athlete retained | Parent dashboard, one Sandbox Athlete, zero bookings; captured error log empty | PASS limited readback |
| Same PARENT: directly visit `/trainer/profile`, then `/admin` | Deny privileged views | Both redirected to `/parent/dashboard`, rendered heading verified | PASS |
| Same PARENT: click Find Trainers, then Reset search | Reach catalog and show truthful result | `/browse`, zero unfiltered trainers, No trainers found, usable reset/filter controls | PASS empty state; booking-selection gate remains blocked by absent hosted listing |

The first shell probe could not open sockets inside the sandbox and recorded status 0, not HTTP responses. The approved network-capable retest above completed all eight checks and exited 0. The browser role checks used the existing session without exporting cookies or credentials. No hosted account, listing, booking, payment, transfer or payout was created or deleted. Hosted trainer/admin functionality, provider checkout success, webhook delivery and settlement remain unverified; local fixture results do not substitute for those gates. These publication updates are documentation-only and will be pushed separately from the tested source.
