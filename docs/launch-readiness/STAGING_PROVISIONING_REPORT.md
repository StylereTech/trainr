# Isolated Preview Provisioning

## Parent Signup Email Delivery Blocker

2026-10-11 04:15 UTC; isolated audit Preview; owner-created parent test account (address and credentials withheld); reviewed repository source `fa6d337`:

- Owner completed signup and reported verification failure. `/account/verify-email` renders signed-in navigation, Not verified, and `Verification email is temporarily unavailable. Try again later.` Expected verification email delivery; actual delivery unavailable. **FAIL / external configuration blocker**. This is not verification success.
- Vercel project variables, All Environments, search `RESEND`: only Production `RESEND_API_KEY`; Shared search: no results. Search `EMAIL_FROM`: no project or shared result. No values were revealed or copied. Preview lacks both required email settings.
- Reviewed `src/lib/account-email.ts`: missing provider key or sender returns `unavailable`. `POST /api/auth/verification-email` maps that result to the displayed 503 message. This configuration failure is sufficient to explain the error; no provider acceptance/delivery evidence exists.
- Read-only Neon query grouped users by role, counted non-null `emailVerified` and non-null `verificationToken` without retrieving their values. Actual: PARENT users **1**, verified users **0**, pending-token users **1** (853 ms). **PASS parent-account persistence**, not independent login/recovery/verification proof.
- Fix status: no authentication bypass or manual email-verification flag edit. Opened Resend sign-in for the owner; a properly scoped sending key and verified sender require provider access before configuration and redeployment. Production credentials remain unchanged.
- Retest pending: provider acceptance, owner receipt and one-time verification-link completion, refresh persistence, expired/replayed link behavior, and remaining authenticated booking/Connect/payout flows. Runtime commit for the owner's signup was not independently resolved in this pass; the repository review SHA is not represented as that runtime proof.

## Authentication Configuration Follow-Up

2026-10-11 03:38-03:41 UTC, authenticated Vercel owner and anonymous application browser, source `a4cf3129eafc7c93e8b7b30a3c77cf81d25ca0b8`:

- Owner reported saving the prepared secret. Environment-variable search verified `NEXTAUTH_SECRET` as **Secret**, **Preview**, branch `codex/payment-readiness-20261006`; the success alert explicitly required a new deployment. The value was not revealed. This resolves the earlier owner-secret configuration gate, not login verification.
- Redeployed exact audit source through Deployment Actions > Redeploy, Preview selected, same audit branch/domain, build cache unchecked. New deployment `7AMxYNEtnETbydN3gZT4uWbthVBi`, unique URL `https://trainr-angxygv92-styleres-projects.vercel.app`, reached **Ready**. No production promotion or production-secret change.
- Browser opened the stable audit alias `/` and navigated Get Started to `/auth/signup`. Expected readable application/signup; actual both rendered. **PASS page reachability**. This supersedes the blanket browser-access blocker for those pages only.
- Anonymous `/parent`, `/trainer/dashboard`, and `/admin` each redirected to `/auth/signin` with its corresponding encoded `callbackUrl`. **PASS anonymous page-route protection**; authenticated role isolation and API authorization are not established by these three checks.
- `/api/health` still produced browser `ERR_BLOCKED_BY_CLIENT`. **BLOCKED health observation**, not an application failure or DB connectivity verdict. No alternate transport was used to bypass it.
- Prepared non-sensitive names `Audit Parent` on the parent signup form. Email, password, confirmation and terms/submission remain an owner handoff. No signup success is claimed. Actual parent/trainer sessions, booking Checkout, Connect onboarding and payout tests remain pending.
- Documentation/settings-only pass; prior unit/integration evidence was not rerun. The signed platform webhook proof in `STRIPE_WEBHOOK_INGRESS_REPORT.md` was obtained before this redeploy and is not represented as a new-runtime retest.

2026-10-11 02:49 UTC follow-up: the approved domain exception is now validated by actual Stripe platform webhook deliveries, not just settings. [Provider event IDs, HTTP responses and independent negative-write proof](STRIPE_WEBHOOK_INGRESS_REPORT.md). Application money-flow and separate Connect delivery are still unverified.

- Recorded: 2026-10-09 04:38 UTC; subsequent evidence is appended below.
- Baseline commit: `8e2a945523aa4031644e1de605c202bab87b096d`.
- Verified/pushed source: `076e9f532056618ce604b00323aca6d390753045`, audit branch `codex/payment-readiness-20261006`.
- Environment: Vercel project `trainr`, Preview only; independent Neon free database; existing Style.re Stripe sandbox.
- Operator accounts: authenticated Vercel `styleretech` / `styleres-projects`, Stripe sandbox `acct_1RAkm8PvdPuIlEw5`. No parent/trainer application account has been used in this provisioning pass.
- Result: **HOLD** for provider-backed application testing and production readiness. Configuration is not payment evidence.

## Approved Scope And Observed Results

The owner approved the Neon integration terms/free setup, the transfer of existing sandbox keys and new destination signing secrets to this audit preview, and explicitly approved Preview-only database access. No paid plan, live Stripe mutation, production secret copy, production database mutation or production promotion was performed.

| Exact steps / route | Expected result | Actual result | Status |
| --- | --- | --- | --- |
| Vercel Storage > Neon > Free; optional Neon Auth unchecked | Independent free database without replacing TRAINR authentication | Created `trainr-audit-staging-20261009`, project `steep-field-81581985`, store `store_XfqL8TP23Pm8rabk`; Washington DC AWS | PASS |
| Resource > Connect Project > `trainr`; Preview checked, Production/Development excluded, sensitive credentials | Only preview deployments receive new DB credentials | UI confirmed `Connected Project trainr to Database`; Preview-scoped DB variables visible | PASS; connection is Preview-wide, not branch-specific |
| Resource Query, read-only identity/count SQL | Verify empty nonproduction DB before schema changes | `neondb`, `neondb_owner`, public table count `0` | PASS |
| Sandbox Workbench > platform destination | Platform payment events reach audit webhook endpoint | Active `we_1UOVC2PvdPuIlEw5lmUAZkMN`, Your account, snapshot API `2025-03-31.basil`, 22 subscriptions | PASS configuration; delivery NOT TESTED |
| Sandbox Workbench > connected-account destination | Trainer readiness events have separate signing secret | Active `we_1UOVGbPvdPuIlEw5K131lGyU`, Connected accounts, `account.updated`, same endpoint | PASS configuration; delivery NOT TESTED |
| Vercel Environment Variables > audit branch only | Preserve production and isolate test Stripe credentials | Secret `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`; Config `NEXT_PUBLIC_STRIPE_PUBLIC_KEY`, `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL` saved | PASS configuration; runtime pending |
| Add `NEXTAUTH_SECRET`, Secret, audit branch only | Independent authentication credential entered and saved by owner | Blank prepared form handed to owner; not submitted by agent | OWNER ACTION PENDING |
| Deployment Protection settings | Determine webhook ingress requirements | Standard Protection / Require Log In enabled; no domain exception configured | BLOCKED pending precise domain-exception approval |
| Query > create audit ownership schema/table/row | Explicit marker outside public schema before migration | `trainr_audit_guard.ownership` contains resource `trainr-audit-staging-20261009`, project `steep-field-81581985` | PASS; no app schema initialized yet |
| Add Config `TRAINR_STAGING_INIT` on audit branch only | Explicit initialization opt-in without production scope | Success toast and Preview/branch row verified | PASS |

Preview URL: `https://trainr-git-codex-payment-readiness-20261006-styleres-projects.vercel.app`.
Both webhook destinations use that URL plus `/api/payments/webhook`.

## Failures And Recovery Evidence

- Vercel rejected a `NEXT_PUBLIC_` key in a Secret bulk-save form, but saved the two preceding private-secret rows. We verified those rows without revealing values, then saved the publishable key separately as Config. No duplicate replacement or production edit was performed.
- Neon Query rejects multiple SQL commands in one prepared statement. The attempted transaction failed with `cannot insert multiple commands into a prepared statement`. Retest used three single statements: create schema, create table, then insert returning the exact resource/project identity. Each succeeded. The query editor was returned to read-only mode afterward.
- A Vercel save observation timed out. A fresh DOM observation showed the saved branch-only `TRAINR_STAGING_INIT` row and success toast; the save was not repeated.
- New initializer focused unit tests: **25/25 passed**. Full `npm run check` is in progress at this timestamp; an existing parent-onboarding test timed out at 5 seconds and requires focused/full retest. No overall green claim is made yet.
- Focused timeout retest: **29/29 passed** across parent workflows and the initializer with no test-timeout or application changes. Full-suite retry subsequently passed **981/981 tests in 48 files**; build completion is recorded separately below.
- The existing `prisma/seed.ts` was inspected, not executed. It deletes application records and creates fixed-password demo users, so it must not be used to initialize this preview or production. Controlled fixtures remain a separate step.

## Guarded Build Initialization

`scripts/prepare-staging.mjs` is inert without `TRAINR_STAGING_INIT`. With opt-in it rejects any environment other than this exact Vercel Preview branch, any live Stripe keys, non-Neon/mismatched/unencrypted DB URLs, missing/mismatched ownership, and overlapping initializers. It invokes the committed Prisma migrations only when the marked database's public schema is empty, then verifies all migration names, SHA256 checksums, completion and rollback fields.

Subsequent builds only verify the existing ledger. Unknown nonempty databases, incomplete migrations and changed migration history fail closed; this is not a general production migration mechanism. Provider/CLI connection diagnostics are suppressed to avoid leaking credentials. Normal builds and production have no opt-in and perform no database initialization.

Operator recovery: inspect the isolated database and migration ledger if initialization fails. Do not reset, baseline, replay, or mark failed migrations resolved automatically. Do not copy the opt-in marker or environment variable to production. Remove the audit-branch flag after setup if build-time ledger checks are no longer desired; schema remains intact.

## Webhook Subscriptions

Platform: `application_fee.created`, `application_fee.refund.updated`, `application_fee.refunded`, `charge.dispute.closed`, `charge.dispute.created`, `charge.dispute.funds_reinstated`, `charge.dispute.funds_withdrawn`, `charge.dispute.updated`, `charge.refund.updated`, `charge.refunded`, `charge.updated`, `checkout.session.async_payment_succeeded`, `checkout.session.completed`, `payment_intent.payment_failed`, `payment_intent.succeeded`, `refund.created`, `refund.failed`, `refund.updated`, `transfer.canceled`, `transfer.created`, `transfer.reversed`, `transfer.updated`.

The Transfer group selected an additional legacy `transfer.canceled` event; the application ignores it. Both destinations had zero deliveries at setup. The dashboard's available snapshot version differs from the application's `2024-06-20` SDK version; actual event compatibility remains a required provider-backed test, not assumed.

## Remaining Gates

1. Owner completes and saves the prepared independent `NEXTAUTH_SECRET` form without sending its value in chat.
2. DONE 2026-10-11 02:42 UTC: owner-approved exception saved for the single audit Preview domain. Global protection remains enabled. Actual ingress is still unverified; see the retest below.
3. DONE at 04:48 UTC: full quality gate, source push, Ready Vercel Preview, actual migration ledger and empty application-record counts verified. See final evidence below.
4. Exercise controlled parent/trainer accounts through TRAINR, sandbox Connect onboarding, full test Checkout, signed webhook, persisted booking/payment state after refresh, destination transfer, and payout readiness/status. None is passed by this setup report.
5. Preserve existing product and production gates, including incomplete package purchase/credit workflows and production schema/backup review.

## Approved Domain Exception Retest

- Timestamp: 2026-10-11 02:42 UTC.
- Source baseline: `39d827d14bf838e4817c06d69f9a67c56d158ec0`; documentation-only follow-up, no application code change.
- Environment/account: authenticated Vercel `styleres-projects`, project `trainr`, isolated audit Preview. No parent/trainer account used.
- Settings route: `/styleres-projects/trainr/settings/deployment-protection`.
- Approved domain: `trainr-git-codex-payment-readiness-20261006-styleres-projects.vercel.app` only.
- Exact steps: after the owner's action-time approval, clicked Add Domain, entered the exact alias, continued, entered the matching confirmation domain and required verification phrase, then clicked Remove Protection.
- Expected: one domain exception, with global Require Log In / Standard Protection unchanged.
- Actual/retest proof: completed UI shows that exact alias in the Unprotected Domains table; Require Log In remains checked and Standard Protection remains selected. **PASS configuration**. Production and other domains were not changed. The exception persists until manually removed from this list.
- Reachability step: opened the alias plus `/api/health` in a fresh in-app browser tab after the saved exception.
- Expected: readable application health response; actual: `net::ERR_BLOCKED_BY_CLIENT`. **BLOCKED browser validation**, not evidence of application failure or successful public ingress. No browser warning or client protection was bypassed.
- Fix status: domain-exception approval/configuration gate resolved. Independent `NEXTAUTH_SECRET` entry and submission remain with the owner in the prepared branch-only form. No credential value was entered or read in this pass.
- Remaining tests: provider-backed webhook delivery, authenticated parent/trainer flows, Checkout, Connect and payout evidence are **NOT TESTED in this pass**. Prior 981-test/build evidence is unchanged, not rerun for this documentation/settings-only update. No production promotion or financial records were created.

## Publication And Quality Retest

2026-10-09 04:45 UTC: `npm run check` completed with exit 0: lint (existing warnings), typecheck, **981/981 unit tests in 48 files**, Prisma generation, Next production build and **73/73** static pages. The parent workflow timeout did not reproduce in either the focused or full retry. Real PostgreSQL integration suites and browser E2E were not rerun in this provisioning pass.

Code commit `076e9f532056618ce604b00323aca6d390753045` was pushed successfully to the audit branch. A fresh remote fetch confirmed main remains `2067e743c54ffee669cd484f26dc472b157f1881`; no merge, force push or main promotion occurred. Vercel began Preview deployment `5cCNPFmJcWYkx28RbVzcgwjSaFKc` (`trainr-nr9cs5xco-styleres-projects.vercel.app`) from the exact new source. Deployment completion and SQL verification follow below; a building status is not treated as success.

### Deployed Schema Retest: PASS

2026-10-09 04:48 UTC: Vercel deployment `5cCNPFmJcWYkx28RbVzcgwjSaFKc` is **Ready**, source `076e9f532056618ce604b00323aca6d390753045`, Preview environment. The actual build log at 21:46:06 PDT says `Audit staging schema initialized; migration checksums verified.` This proves the guarded hook ran on Vercel, not merely in local mocks.

Independent read-only Neon Query returned **migration_count 11, finished_count 11** (854 ms):

```sql
SELECT count(*) AS migration_count,
       count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) AS finished_count
FROM public._prisma_migrations;
```

Second independent query returned `database_name = neondb`, **users 0, bookings 0, payments 0, sports 0** (807 ms):

```sql
SELECT current_database() AS database_name,
       (SELECT count(*) FROM public.users) AS users,
       (SELECT count(*) FROM public.bookings) AS bookings,
       (SELECT count(*) FROM public.payments) AS payments,
       (SELECT count(*) FROM public.sports) AS sports;
```

The ownership marker persists outside the public schema. Query editor is read-only again. No application data was seeded; sports/reference data and controlled test users still need initialization before full flow testing.

### Browser Smoke: PARTIAL / BLOCKED

Opening the deployment-specific Preview through the authenticated Vercel dashboard loaded the TRAINR home page, sports navigation, trainer signup link and image descriptions in the browser. This is only a rendered-page smoke test, not proof of successful login, payments or payout readiness. No responsive visual audit was performed in this provisioning pass.

Navigating the stable branch URL to `/api/health` produced `ERR_BLOCKED_BY_CLIENT` and a browser page saying the URL was blocked by Codex. No security interstitial or deployment protection was bypassed. Vercel settings independently show Standard Protection / Require Log In enabled. The stable callback domain remains unverified; the narrowly scoped domain-exception request and owner auth-secret form remain pending. The earlier signed-out Stripe, unprovisioned database, and absent sandbox-key blockers are resolved, but money-flow signoff remains **HOLD**.
