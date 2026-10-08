# Deployment Configuration And Verification Audit

## Scope And Identity

- Date/time: 2026-10-08, approximately 10:00-10:34 UTC; publication evidence below.
- Baseline SHA: `af48930057a74adbe209dc974896e108199a96c6`, branch `codex/payment-readiness-20261006`. Changes in this report's commit are verification tooling only, not application routes or schema.
- Environments: authenticated Vercel dashboard for `styleres-projects`, GitHub repository checks, anonymous `https://trainr.cc`, local synthetic tests and disposable PostgreSQL. Dashboard accessed using the owner's existing authenticated session. No customer account or live payment operation used.
- Overall status: **HOLD**. A successful Git preview build is not a verified production rollout or working Stripe test environment. No production settings, secrets, DNS, database records, main branch or financial accounts changed.

## Fresh Deployment Evidence

Exact read-only steps: open the existing Vercel deployment, follow Preview settings, inspect both Project and Shared variable tabs, then open the team project list, `trainr-node` overview and its environment-variable tabs. Read names/scopes only; do not reveal, copy or change values.

| Surface | Expected readiness evidence | Actual observation | Status |
| --- | --- | --- | --- |
| `trainr` Preview settings | Isolated runtime database, authentication and Stripe test configuration | `No Environment Variables Added`; Shared tab `No shared variables linked`; no Preview domains attached | BLOCKED: no configured staging found here |
| `trainr` team project card | Identified deployment target | Git-connected to `StylereTech/trainr`; `No Production Deployment` | PASS identification only |
| `trainr-node` overview | Current source serving both production domains | Ready deployment `FEp6XgWZotobnxofLrhpssQdJoWN`, created May 31; source main `2067e74`; domains `trainr.cc`, `www.trainr.cc`; `Connect Git` button | FAIL latest audit rollout: live is older source |
| `trainr-node` Project variables | Correctly scoped runtime configuration | Twelve listed variables, all Production only; see inventory below | Inventory PASS, values/modes not verified |
| `trainr-node` Shared variables | Identify additional runtime configuration | `No shared variables linked` | PASS inventory; no shared staging discovered |
| GitHub commit status for baseline SHA | Preview build evidence | Vercel `success`, `Deployment has completed`, deployment `3E1GzzNq2KPYCH98LbQs5aavP2bi` | PASS build status only |
| GitHub Actions run `37760068006`, job `113254039628` | Executed hosted quality gate | `failure`, `steps: []`; annotation: `The job was not started because your account is locked due to a billing issue.` | BLOCKED: account billing |

Production project variable names: `TRAINR_VOICE_WS_URL`, `EMAIL_FROM`, `STRIPE_PLATFORM_FEE_PERCENT`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLIC_KEY`, `STRIPE_PUBLIC_KEY`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `DATABASE_URL`.

`RESEND_API_KEY` was not listed in current project or shared settings. This is a configuration gap to investigate, not proof about the immutable May deployment's exact runtime values or email delivery. Stripe mode and database isolation cannot be inferred from masked names. Vercel marked DATABASE_URL, NEXTAUTH_SECRET, STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET as Config values needing attention and recommended secret handling/rotation. No credential was revealed or rotated during this audit; coordinate any rotation with webhook/session/provider cutover.

Evidence links: [Preview settings](https://vercel.com/styleres-projects/trainr/settings/environments/preview), [live project](https://vercel.com/styleres-projects/trainr-node), [production configuration](https://vercel.com/styleres-projects/trainr-node/settings/environment-variables), [baseline preview](https://vercel.com/styleres-projects/trainr/3E1GzzNq2KPYCH98LbQs5aavP2bi), [CI run](https://github.com/StylereTech/trainr/actions/runs/37760068006).

## Verification Defects And Fixes

- P1 false-positive readiness: the old production checker accepted matching Stripe test keys. It now requires live-mode key prefixes and an authenticated provider `balance` response with `livemode: true`. This is read-only authentication evidence, never checkout/Connect/payout signoff.
- P1 false-positive database evidence: the old `db:check` accepted a successful TCP connection without authentication or SQL. It now requires the exact `SELECT 1 AS readiness` result through Prisma. This is not migration, schema, write-persistence or authorization proof.
- P2 sensitive diagnostics: old checks printed configured URLs, database identity, provider error bodies and exception messages. The replacements emit fixed diagnostic categories and safe HTTP statuses only. No raw credentials/provider bodies are emitted intentionally.
- P2 unbounded/misleading checks: provider reads have a ten-second abort and reject redirects; database connection/query limits plus a twenty-second CLI deadline prevent indefinite checks. Prisma v6 connection options follow the [PostgreSQL connector reference](https://docs.prisma.io/docs/orm/v6/overview/databases/postgresql).
- P2 inconsistent configuration: both scripts now share native Node dotenv parsing and identical file precedence without overriding explicit process values. The obsolete environment fee percentage no longer establishes fee readiness: effective booking fees come from validated database FeeConfig. A sender and provider API key are required for production configuration, but actual delivery remains unverified.

## Exact Local Retest

1. Run `npx vitest run tests/readiness-checks.test.ts`: check production/test modes, malformed/missing values, no diagnostic leakage, dotenv precedence, live provider response contract, network/JSON failure, URL connection bounds and real-query contract. Stripe responses are simulated; no provider request is made by these unit tests.
2. Initial sandbox launch could not read the Vitest configuration. Typecheck also identified a test-fixture environment type mismatch; added the loader's explicit record type. Rerun outside that Windows restriction passed **20/20 focused tests** and typecheck.
3. Run `npm run check`: final results recorded below. The full unit run passed **664 tests / 36 files**. Build initially reported a TLS disconnect/retry; do not treat this intermediate message as either a completed failure or a pass.
4. Test `db:check` against disposable local PostgreSQL and a local socket that cannot answer PostgreSQL. Expect success only for the former, nonzero/redacted failure for the latter, with bounded execution. Actual results below.

## Live Smoke

Anonymous GET only on the older production source: `/api/health` returned 200 with `ok: true`, `dbConnected: true`; `/api/payments/connect` and `/api/admin/bookings` returned 401. `/api/trainer/stripe-connect` initially timed out at 20 seconds; a separate strict-error-handling retry returned 401. The initial loop retained the preceding response on timeout, so its printed status for that one route was invalid evidence and is explicitly discarded. No authenticated booking/payment write, new-code runtime verification or real Stripe transaction was attempted.

Anonymous Preview `/api/health` at `trainr-git-codex-payment-readiness-20261006-styleres-projects.vercel.app`: an auto-followed request ended at HTTP 200 with `text/html`, not health JSON. A separate request with redirects disabled returned **302 to `https://vercel.com/sso-api`** (query values omitted). Deployment protection prevents anonymous runtime proof; no protection setting was changed or bypassed. This is not a health pass.

## Safe Next Deployment Gate

- Owner must configure a genuinely separate disposable PostgreSQL instance/database, independent authentication secret and Stripe test-mode keys/webhook secret in a staging environment. Do not copy production credentials or production financial/customer records to Preview. Keep secrets out of chat and version control.
- Record exact staging project, branch, immutable deployment URL and source SHA. Configure callback origins and test webhook delivery for that deployment. Review notification recipients and side effects before test accounts are created.
- Rehearse schema bootstrap and all ordered migrations against disposable data. Existing migration history starts with a phone-lead table referencing pre-existing `trainer_profiles`; no complete initial migration exists in this tree. Do not blindly run `migrate deploy`, `db push` or `migrate reset` against production. Production drift, backup/restore and migration baseline remain unverified.
- Verify parent/trainer registration, bookings, actual test Checkout, signed webhook persistence after refresh, Connect and payout readiness in that isolated deployment. Synthetic provider responses are not substitutes.
- Resolve hosted CI billing, review and publish main, then roll out to the **actual `trainr-node` production target** under a separately reviewed migration/configuration plan. Git-connected `trainr` previews do not establish that trainr.cc has changed.
- Full goal remains active. Existing cancellation, booking timing/expiry, email/athlete, account-retention/security and actual financial settlement gates remain open. No final production or money-flow signoff.

## Final Evidence

- Local static/unit gates: lint (existing warnings), typecheck and **664 unit tests / 36 files passed**. The combined `npm run check` was not a clean pass: compilation stopped reporting progress after an external TLS retry. At 10:14 UTC the verified build/worker processes were stopped after approximately six minutes; an HTTPS connection to a Google address was observed, and source uses `next/font/google`. Root cause remains unproven.
- Unchanged-source build retry with `NODE_OPTIONS=--dns-result-order=ipv4first`: **exit 0**, compiled in 44 seconds, generated **70/70 pages** and completed tracing at approximately 10:16 UTC. TLS verification was not disabled. Only the resolved in-worktree `.next/cache` was removed before/after builds for disk space.
- Guarded local database: `trainr_audit_20261008` on loopback port 55439, role `trainr_test`; guard returned `disposable integration database`. Local access uses trust authentication, not a production credential. `npm run db:check` returned **exit 0** and `DB CHECK: PASS (authenticated SELECT 1; not schema or persistence signoff)`.
- Real command-line failure probes: malformed URL containing a synthetic secret marker returned exit 1 without the marker; a loopback TCP server accepting connections but never speaking PostgreSQL returned exit 1 in **5226ms**, without a PASS or credential output; production CLI with matching synthetic test-mode keys returned exit 1 before Stripe access. All three probes passed and their temporary socket/processes closed. Unit provider responses remain simulated.
- `npm run test:postgres` against the guarded database: **134 tests / 5 files passed in 17.59 seconds** at 10:17 UTC. Existing deliberate constraint-failure logs are expected rollback-test output, not production records.
- Browser matrix initially reproduced a desktop booking timeout: `shows an unchargeable discount and allows correction`, waiting for the visible/enabled/stable athlete option click at the unchanged 30-second test limit. Its mobile equivalent passed. Trace, video and error context retained under ignored `e2e-report/deployment-check-timeout-20261008/booking-local-regression-l-be98f-count-and-allows-correction-chromium/`. This is a real failed run, not a pass; no UI code, assertion or timeout was relaxed. Root cause remains unproven.
- That first full browser run finished **50 passed / 1 failed in 4.5 minutes**. Focused unchanged rerun: `npx playwright test e2e/booking-local-regression.spec.ts --project=chromium --workers=1 --grep '1440px.*unchargeable' --repeat-each=3` passed **3/3 in 27.8 seconds**. Intermittent browser stability remains an open risk, not a fixed defect.
- Fresh `git fetch origin main` confirmed unchanged main SHA `2067e743c54ffee669cd484f26dc472b157f1881`. Audit changes remain isolated; no merge or promotion performed.
- Final unchanged full browser retest: **51/51 passed in 3.3 minutes**. Command: `npx playwright test local-regression.spec.ts --project=chromium --workers=1`, with loopback `BASE_URL`, guarded `TEST_DATABASE_URL`, `TRAINR_ALLOW_DB_TESTS=1`, local-only session secret and `LOCAL_E2E_CHANNEL=msedge`. Desktop 1440px/mobile 390px fixtures cover booking recovery, role/session boundaries, catalog/profile, Connect unknown states, dashboards, public views, refunds and approval. Synthetic accounts only; external Stripe operations simulated. No claim of production registration, real payment or payout execution.
- At approximately 10:34 UTC, SQL cleanup query returned zero users, bookings, payments, Connect attempts, admin actions and notifications. The verified loopback app and disposable PostgreSQL instance were stopped. All build/test/probe processes completed or were explicitly stopped as recorded above.
- Source/tooling/report commit **`37c81fd69d07ecf40cb5aa82840faf44ccb937e0`** was pushed to `origin/codex/payment-readiness-20261006` at approximately 10:36 UTC. First push failed to resolve github.com; normal retry succeeded. Subsequent `ls-remote` read-back failed to connect, so `gh api repos/StylereTech/trainr/git/ref/heads/codex/payment-readiness-20261006 --jq .object.sha` independently verified the exact SHA. Local worktree was clean before this publication-evidence-only follow-up. Main and production were not changed. The full production-readiness goal remains active, not complete or externally blocked in its entirety.
