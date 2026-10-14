# Current Launch Gates

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
