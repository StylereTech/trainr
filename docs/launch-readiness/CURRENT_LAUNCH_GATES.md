# Current Launch Gates

**2026-10-16 09:59 UTC:** [Guarded package SQL retest](PACKAGE_CONNECT_READINESS_REPORT.md#guarded-postgresql-retest-2026-10-16-0959-utc) now passes 444/444 focused and 1,212/1,212 full integration cases on the independently verified disposable local PostgreSQL database; six fixture categories returned 0 and the server is stopped. This supersedes the 09:44 "not run" SQL status below. Provider behavior is mocked in these tests. Actual sandbox checkout, signed webhook, transfer, payout and refund-policy implementation remain open. **Production HOLD.**

**2026-10-16 09:44 UTC:** [Package Connect readiness follow-up](PACKAGE_CONNECT_READINESS_REPORT.md) is pushed at `f3ff879879f5df576cb6868f4086e55266b5695c` and Ready in audit Preview. Full local gate passes 1,790 units, lint/types/build. Signed-in parent review of the $90 shared package now shows the restricted-account hold, no purchase control, and history remains 0. New guarded SQL cases were not run without a disposable DB; sandbox package payment/webhook/credit redemption remains unverified. **Production HOLD.**

**2026-10-16 09:21 UTC:** [Parent quote/UI follow-up](PAID_BOOKING_CONNECT_GUARD_REPORT.md#quote-and-parent-ui-follow-up) is pushed at `c5817ddb5774bdf5b8fa4358a1ee401bbfdc2eb5` and Ready in audit Preview. Full local check passes 1,787 units, lint/types/build; signed-in browser confirms the restricted trainer's $50 service now shows a clear Connect error, disabled Book & Pay, and no false Stripe payment copy. Parent dashboard remains 0 bookings. Complete Connect onboarding before attempting sandbox payment. **Production HOLD.**

## Paid Booking Connect Guard

**2026-10-16 08:54 UTC**, source `e1765b79f12c97e80bbae66377d8109a15614614`: a paid reservation now fails before coupon or booking writes when the trainer's saved Connect state is unready. Focused 70/70 and retested full 1,785/1,785 units, lint/types/build pass; an initial full-suite run had two nonrepeating esbuild test timeouts. Vercel Preview is Ready and public homepage/catalog smoke passed. Hosted booking write, Checkout, webhook, transfer and payout remain **unverified**, and the published cash-refund policy remains a release blocker. [Exact evidence and limits](PAID_BOOKING_CONNECT_GUARD_REPORT.md). **Production HOLD.**

## Approved Preview Accounts And Signed-In Tests

**Published retest:** `e66773f7e7d2441c0ce846625562588c9bdafa17` is Ready in Preview. Full local gate passes (1,783 units, lint/types/build); deployed retest passes 30 authenticated and 21 anonymous checks, two-way parent/trainer messaging, and mobile admin navigation. Billing prevents GitHub CI from starting. Stripe completion/payment handoffs and prior financial/policy/Production gates remain open. [Publication and proof](PREVIEW_ACCOUNT_PROVISIONING_REPORT.md#published-preview-retest).

**2026-10-16 07:21-07:45 UTC**, hosted source `d80c02f8b8b8282a879a05ccd5dc2671fc56f427`: the owner explicitly authorized additive test users. Three isolated Preview accounts now exist; all three browser logins and **30/30 authenticated API checks pass**. A parent athlete, trainer profile/service/schedule, active two-session package, and admin listing approval were saved and read back. A real **sandbox** Connect account was created and its hosted onboarding opened, but capabilities remain disabled. Stripe terms approval and a user-performed Book & Pay step are pending; no payment, webhook, transfer, or payout completion is claimed. [Exact steps, identities, scope, and limits](PREVIEW_ACCOUNT_PROVISIONING_REPORT.md). This supersedes older pending-provisioning and zero-catalog statements below. **Production HOLD.**

## Destructive Seed Guard

**2026-10-16 02:00 UTC**, baseline `daf63e79ae1037dbda790ceb34c5a0c4a0d84ca8`: the legacy seed now rejects hosted/Production targets before client creation and requires an explicitly opted-in, verified disposable local database and ownership marker before seed writes. Seed errors exit nonzero without raw database diagnostics. **41 focused guard cases and 1,766 full-suite units pass**, plus lint/types/build; two actual entry-point refusal checks returned the expected nonzero guard codes. No seed writes, database changes or Preview accounts were created. [Scope, exact tests and limits](DESTRUCTIVE_SEED_GUARD_REPORT.md). This supersedes the earlier missing-runtime-guard finding; actual seed fixture compatibility and an additive hosted provisioning path are not verified. **Production HOLD; hosted money-flow gates unchanged.**

## Latest Account And Quality Retest

**2026-10-16 01:43 UTC**, source `04682831eaaed9589969ada11f01314ad6446b5c`: full local `npm run check` **PASS**, exit 0, including **1,725/1,725 units**, lint (42 warnings), types and build. The unchanged focused timing files also passed 22/22; intermittent failure root cause remains OPEN. Fresh full-tree npm audit still reports **8 high / 0 critical**, exit 1. The user-supplied legacy parent/trainer/admin credentials failed in Preview; a fresh read-only query confirmed none of those three emails exists in the isolated staging database. Additive account-creation approval remains pending. The unsafe legacy database runbook was corrected; destructive demo seed was not run and has no new runtime guard. [Exact evidence, commands, limitations and remaining work](ACCOUNT_PREREQUISITES_RETEST_REPORT.md). **Production HOLD.** Dated entries below are historical, not a replacement for this latest quality result.

## Webhook Mode Follow-Up

Published runtime **`6d22bc6fc60b5001d289414dc2c467fcc0508b05`**, independently Ready in audit Preview at **2026-10-14 05:47:29 UTC**. **21 hosted health/auth and 13 header probes pass**; catalog remains 0 and current CI remains billing-blocked. Exact attribution and raw probes are in the report below; actual money-flow gates remain open.

**2026-10-14 05:44 UTC**, baseline `d05a1461c2e496e20259f299ac70aabe3a601a33`: reproduced and fixed opposite-mode signed Stripe events reaching application handlers. Signature/scope verification now precedes mode filtering; valid opposite-mode events are explicitly acknowledged without dispatch. **1,709 unit, 1,208 SQL, 10 built HTTP and 46 selected browser cases pass**, plus lint/types/build; fixtures cleaned and local services stopped. [Exact failures, fix, scope, cleanup and publication](WEBHOOK_MODE_ISOLATION_REPORT.md). The latest full gate passes; preceding timeout evidence below remains historical and its root cause is not proven resolved. Actual hosted money flow and other launch gates remain **HOLD**.

## Unit Timing Follow-Up

**Final retest 2026-10-14 05:19 UTC:** with logging disabled, focused suite **15/17 FAIL**, compilation and traversal-security tests timed out. The earlier 17/17 success below was not stable; reliability remains OPEN.

**2026-10-14 05:15 UTC:** latest full diagnostic run **1,614/1,616**, two existing 5s esbuild compilation timeouts; unchanged focused retest **17/17**. Full gate remains **FAIL**, not repaired by the focused pass. Default configuration already used one worker; the earlier explicit one-worker retry changed no parallelism. Optional phase logs added without changing assertions or time budgets. One aggregate host sample showed 100% CPU / 993 MB free RAM, but causation remains unproven. [Exact steps, timings and limitations](UNIT_TIMING_DIAGNOSTIC_REPORT.md).

## Connect Identity Follow-Up

Published runtime source `0e5f4cdbce2e63c56ebe1f00a4bb20a384ab8085`, independently Ready in isolated Preview; 21 health/auth and 13 security-header probes pass at 2026-10-14 05:03 UTC. Exact source/deployment and CI billing evidence are in the linked report. This does not clear the final full-unit timing failures or hosted money-flow gates.

2026-10-14 04:59 UTC: package payment/checkout history now blocks automatic creation of a replacement Stripe account when the trainer link is missing, and the profile payout panel retains the API's reconciliation message. **50 focused Connect, 1,208 full SQL and 46 selected browser cases pass**; final build passes. Final full-unit attempts each had one timeout, so the final quality gate is **not green**. [Exact failures, focused retests, screenshots and publication](CONNECT_PACKAGE_IDENTITY_REPORT.md). No provider account was created. The requirement audit below remains the baseline; actual hosted money flow and other launch gates remain **HOLD**.

Reviewed **2026-10-14 04:09-04:16 UTC**, clean baseline **`aa5a0753e03970ed84a309edd3a4120406654f8e`**, branch `codex/payment-readiness-20261006`. **NOT PRODUCTION READY.** This is a requirement-level reconciliation, not a new implementation or a full signed-in hosted test run.

Scope: isolated TRAINR audit Preview and previously verified owned disposable local tests. Main, Production/trainr.cc, Story, Replit, provider settings, credentials and real funds remain unchanged. Broad approval does not supply missing accounts, policy definitions, agreements or provider receipts. [Historical checklist and dated follow-ups](LAUNCH_GATES_20261012_HISTORY.md) are preserved separately; superseded missing-feature statements are not current blockers.

## Verified Baseline

- Runtime/test source **`9c119e6da1de22d79c6c214a074ca5fb6cca8d36`**: full local quality gate passed **1,616 units**, TypeScript and production build; **1,188 SQL cases** and **88 selected browser cases**, zero browser retries. These results belong to the preceding security pass, not a rerun in this documentation pass. Provider responses/navigation were simulated. [Exact failures, fixes, commands, timestamps, screenshots and limitations](HTTP_SECURITY_HEADERS_REPORT.md).
- Final documentation source **`aa5a0753e03970ed84a309edd3a4120406654f8e`**: [Vercel deployment](https://vercel.com/styleres-projects/trainr/FmRE3mxzWoK1hgfBh3oRHLvYM7t3) independently showed Ready / Latest / Preview, ready **04:05:34 UTC**, duration 53s. Immutable host `trainr-85y100hru-styleres-projects.vercel.app`; stable audit alias unchanged. Final **13 header** and **21 health/auth** requests passed at **04:06:19-04:06:29 UTC**, exit 0. These overlap; they are not 34 complete customer flows.
- [GitHub run 38509529789](https://github.com/StylereTech/trainr/actions/runs/38509529789) was independently observed blocked by account billing before either check or migration job started. Earlier successful CI entries in historical reports do not describe this source's run. No billing changes or reruns performed.
- Final independent remote read in the preceding pass matched audit HEAD; main remained `2067e743c54ffee669cd484f26dc472b157f1881`. Baseline worktree freshly clean this pass. No pull/merge from main because that would change the isolated audited source.

## Fresh Checks

Preview base: `https://trainr-git-codex-payment-readiness-20261006-styleres-projects.vercel.app`. HTTP probes use no account, cookies or valid webhook signatures. Mutation-shaped probes contain only `{}` and must reject before mutation.

| Steps / expected result | Actual result | Decision |
| --- | --- | --- |
| Run existing 21-case anonymous smoke at baseline SHA; health must report connected DB, catalog must return a valid count, protected APIs must return 401 and unsigned webhook 400 | **21/21 PASS**, **04:12:33.534-04:12:39.222 UTC**, exit 0. `/api/health`: connected. `/api/trainers?limit=1&page=1`: **0** eligible trainers. [Exact methods, endpoints, expected/actual results](CURRENT_LAUNCH_GATES_HOSTED_SMOKE.json) | PASS health/auth subset; BLOCKED selectable-trainer prerequisite, not proof of no raw trainer rows |
| Inspect existing TRAINR sign-in tab without entering credentials or reloading a possible handoff | At approximately **04:13 UTC**, `/auth/signin` still displayed blank email/password fields | Hosted authenticated test unavailable in this tab; existing handoff retained, no repeated credential request |
| Inspect and reload existing Stripe sandbox `/test/connect/accounts`, account `acct_1RAkm8PvdPuIlEw5` | Before reload: All 0 / Enabled 0 / No connected accounts. After reload: AX temporarily blank; screenshot at approximately **04:12 UTC** visibly showed Sandbox, Connected accounts, **All 0** | BLOCKED onboarding prerequisite in this sandbox only. No provider state/account created; screenshot resolves transient AX gap |
| Re-read package purchase/credit handlers and immutable terms | Checkout POST, review GET, credit GET/POST and linked customer controls exist. Version-2 terms contain shared-parent ownership, successful-payment validity start and approved cancellation restoration | Earlier missing-API/policy claims SUPERSEDED, not new runtime passes |
| Compare `/legal/refunds` with `applyBookingAction` and `POST /api/admin/refunds` | Policy promises automatic trainer-cancellation refunds and 10% late-cancellation credit; cash cancellation explicitly issues neither; refund endpoint accepts only `action: reconcile` | Confirmed P1 RELEASE BLOCKER; code/policy work remains, not an external-only dependency |

The smoke's SHA argument labels intended source; it does not prove deployment identity. The independently observed Vercel mapping above supplies baseline attribution. Raw evidence contains status/contract assertions, no private records or credentials.

## Parent Requirements

| Requirement | Actual evidence | Remaining proof |
| --- | --- | --- |
| Create account / email verification | Local SQL persistence/validation coverage; historical hosted parent setup | Fresh hosted registration, delivered verification link and retry unverified. Email setup deferred. [Registration report](ACCOUNT_EMAIL_REGISTRATION_REPORT.md) |
| Log in | Local real-credentials session/revocation tests pass; Preview tab signed out | Authorized hosted parent login/reload; no manufactured sessions. [Session report](SESSION_REVOCATION_REPORT.md) |
| Save child information | Local owned-child transaction tests; Oct12 hosted edit/reload/restore is dated evidence | Fresh current-source hosted create/edit/refresh and ownership rejection |
| Browse/select trainer and service | Local catalog/selection coverage; current hosted catalog count 0 | Owner-controlled eligible trainer, profile, services and availability |
| Buy package | Review, consent, immutable quote, checkout/retry, return and history UI/API implemented and locally tested | Actual sandbox purchase and signed provider evidence. [Purchase UI](PACKAGE_PURCHASE_UI_REPORT.md), [sales API](PACKAGE_SALES_API_REPORT.md) |
| Use credits across children | Shared-parent ledger, balances/options, reservation form/API and transactional consumption implemented; cancellation restoration and dashboards integrated | Hosted purchased entitlement used for two owned children; expiry/service-retirement choices open. [Reservation](PACKAGE_CREDIT_RESERVATION_REPORT.md), [actions](PACKAGE_CREDIT_ACTION_REPORT.md), [dashboard](PACKAGE_CREDIT_DASHBOARD_REPORT.md) |
| Create cash booking and pay in full | Local capacity, idempotency, checkout-recovery and receipt-chain coverage | Actual sandbox Checkout; amount, destination, application fee and signed webhook; no fabricated paid records |
| Correct booking/payment after refresh | Local persistence/reconciliation, holds and recovery coverage | Independently match actual provider objects and persisted parent/trainer views after reload |

Every parent requirement remains PARTIAL or BLOCKED at the hosted end-to-end level. Implemented code and selected local passes do not establish that all parent flows pass.

## Trainer Requirements

| Requirement | Actual evidence | Remaining proof |
| --- | --- | --- |
| Create account / log in | Local role/registration/session tests; trainer signup handoff already open | Owner-controlled trainer credentials and necessary agreements; do not change a parent role to simulate this |
| Create/edit profile | Local validation/management coverage in dated trainer reports | Current hosted save/reload and parent-visible listing |
| Programs/packages/pricing | Local catalog transactions and customer package UI/API implemented | Hosted creation/revision, reviewed purchase and price consistency |
| Availability/schedule | Local time-zone, scheduling, capacity and collision tests | Hosted save/reload, selected slot and conflicting reservation rejection |
| Dashboard/bookings/payments | Local role-scoped reads, credit/cash labels, status actions and review holds | Actual paid sandbox booking/package with correct participants/amounts/statuses |
| Stripe Connect | Local capability handling/UI coverage; refreshed sandbox has zero connected accounts | Owner setup; verify linkage and current charge/transfer/payout capabilities |
| Receive payouts | V1: destination charge, then Stripe-managed bank payout. `/api/trainer/wallet/withdraw` deliberately returns `409 STRIPE_MANAGED_PAYOUTS` to trainers | Actual destination transfer, connected balance and payout status. Transfer is not bank settlement; no second legacy-wallet payout |

All trainer requirements remain PARTIAL or BLOCKED for hosted signoff. [Trainer report](TRAINER_FLOW_VALIDATION_REPORT.md), [Connect report](STRIPE_CONNECT_READINESS_REPORT.md), [payout report](PAYOUT_READINESS_REPORT.md).

## Open Release Gates

1. **P1 refund promise/execution mismatch:** automatic cash refunds and late-trainer-cancellation promotional credits are not implemented. Parent cash refund timing and package cash refunds also need a tested execution path. Reconciliation, restored session credits and operator alerts do not fulfill these promises. Customer-facing policy unchanged. Owner asked whether to implement the promise or prepare a revised manual-support policy for review; neither silently applied. Exact cash boundary, percentage basis, fee/reversal treatment and exception semantics must be specified before money movement.
2. **Package policy details:** shared-parent ownership, successful-payment start, trainer cancellation restoration, parent restoration at least 24h before start, late/no-show consumption already approved and implemented. Do not ask for those again. Remaining choices: session must occur before expiry versus merely be booked before expiry; treatment of purchased services later retired/replaced. Current guard requires session start before expiry and rejects unavailable services; no silent substitute or expiry extension.
3. **Hosted prerequisites and receipts:** signed-in parent/trainer access, eligible catalog and sandbox connected account. Then actual paid booking/package, delayed/duplicate webhooks, refunds/reversals, refresh persistence, destination transfer and payout. Existing account handoffs remain pending. Sandbox completion would not prove Production money flow.
4. **Security/reliability:** fresh Oct14 npm audit has 8 full-tree/6 production affected packages, all high, rooted in braces with no upstream patch. Bounded trace observations do not clear it. Latest run initially hit one unchanged esbuild timeout; focused/full reruns passed but cause unproven. Earlier cold-navigation timeout/admin PATCH reset, 42 lint warnings, middleware deprecation and internal Edge warning are not declared resolved. [Security evidence](HTTP_SECURITY_HEADERS_REPORT.md), [dependency report](DEPENDENCY_SECURITY_REPORT.md).
5. **Operations and CI:** billing prevents current GitHub jobs starting. Unattended exception recovery, secure operator access and actual refund/payout procedures need proof. Local build does not substitute for CI/operations readiness.
6. **Production release:** verify intended project/domain mapping, migrations, backup/restore and rollback; obtain release decision; publish permitted main/Production changes and final live smoke. Audit Preview is not `trainr.cc`. Outside current isolated Preview boundary and NOT DONE.

## Completion Decision

| Original stop condition | Current status |
| --- | --- |
| All parent and trainer flows pass | NOT PROVEN; hosted prerequisites incomplete |
| All critical APIs and database persistence | Local/anonymous subsets pass; actual hosted financial persistence unverified |
| Stripe Checkout, Connect and payout readiness | HOLD; no actual end-to-end provider receipt chain |
| Route protection | Local roles/anonymous hosted probes pass within named scopes; fresh full hosted role matrix incomplete |
| All fixable issues fixed / external-only blockers | FAIL; refund execution/policy and application/operational work remain |
| Changes committed/pushed | Baseline PASS audit branch only; publication of this documentation pass verified separately after commit |
| Final live smoke | Anonymous Preview subset PASS; Production/signed-in money-flow smoke NOT DONE |
| Required reports | All 11 artifacts exist; current summary corrected without erasing dated failures. Presence is not flow signoff |

The 100-build/1,000-test limits are ceilings, not success criteria or an invented aggregate count. No full suite rerun for this documentation-only reconciliation. No application code, schema, payment policy, provider setting, credentials, main, Production or Story changed. Overall **HOLD**, goal active.

## Publication And Retest

- Checklist, archived history, raw baseline smoke and all eleven rollup links committed/pushed as **`4667039b9c88cb9dd0444c2c5059647436abbcc2`**, `docs: reconcile current launch gates with verified features`. Independent `git ls-remote` matched the audit branch; main remained `2067e743c54ffee669cd484f26dc472b157f1881`.
- Documentation checks: `git diff --check` passed; all local links in this checklist resolve; raw baseline evidence parsed as 21 passing cases; archived historical body exactly matches its previous version after line-ending normalization. No new application tests were claimed. Initial combined move/add patch was rejected before editing; separate patches succeeded. One post-test summary initially treated the header JSON wrapper as a result array; reading its actual `results` array confirms 13 passes, not a test failure.
- Normal Vercel UI independently verified matching source/branch, **Ready / Latest / Preview**, [deployment 2w1k187bJ](https://vercel.com/styleres-projects/trainr/2w1k187bJpXdPBmasAcqNqPp513G), ready **2026-10-14 04:18:47 UTC**, duration **42s**. Immutable host `trainr-rj9vbmmo9-styleres-projects.vercel.app`; stable audit alias unchanged. Initial UI navigation timed out; reading the same tab recovered Building then Ready. No manual redeploy or duplicate deployment created.
- Published-source anonymous health/auth retest **21/21 PASS**, **04:19:36.387-04:19:41.246 UTC**, exit 0. DB connected, catalog 0; protected endpoints 401, unsigned webhook 400. [Exact response evidence](CURRENT_LAUNCH_GATES_PUBLISHED_SMOKE.json).
- Published-source browser-header retest **13/13 PASS**, **04:19:45.618-04:19:47.451 UTC**, exit 0. Expected statuses and anti-framing/no-sniff/no-referrer headers retained on pages, redirects, APIs, webhook and 404. [Exact response evidence](CURRENT_LAUNCH_GATES_PUBLISHED_HEADERS.json). These 34 requests partly overlap; no signed-in or money flow was exercised.
- Fresh normal UI for [GitHub run 38510677238](https://github.com/StylereTech/trainr/actions/runs/38510677238) confirms both jobs were **not started due to account billing lock**. Vercel Ready and hosted probes are not a CI pass. No billing action or CI rerun performed.
- This evidence append is documentation only and will be committed separately. Its final deployment/smoke evidence remains local and in the task result to avoid an infinite documentation/deployment loop. Remaining launch gates above are unchanged.
