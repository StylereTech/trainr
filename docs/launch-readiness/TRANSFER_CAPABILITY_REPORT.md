# Destination Transfer Capability Audit

## Identity And Scope

- Date/time: 2026-10-11 UTC; reproduced at 11:52 UTC, implementation/retests followed.
- Baseline: `c669cb44982a384a39d5ce9ea565fa2d4d3d9a0c`, initially clean branch `codex/payment-readiness-20261006`.
- Target: audit Preview `trainr` only, existing branch alias. Main, Production `trainr-node`, Story, provider credentials, database schema and Stripe account-creation parameters are unchanged.
- Local environment: Windows, isolated PostgreSQL 16.15 `trainr_audit_timezone_20261011` on loopback 55439, synthetic `@example.test` accounts, optimized Next build and desktop/mobile Chrome. Provider responses are simulated in automated tests; no actual charge/transfer/payout is implied.
- Routes/surfaces: POST `/api/payments/checkout`; canonical GET/POST `/api/payments/connect`; legacy GET/POST `/api/trainer/stripe-connect`; signed `account.updated` handling on `/api/payments/webhook`; `/trainer/dashboard`; `/trainer/profile?tab=payouts`.
- Overall: readiness boundary repair, not successful money-flow or production signoff. **HOLD** remains.

## Finding And Provider Contract

The prior helper treated details submitted, charges enabled and payouts enabled as sufficient. It never inspected transfer capability. Six helper cases without active transfer evidence returned true, and three checkout cases with missing/pending/inactive transfers proceeded instead of refusing preparation. Baseline `.postgres-test/transfer-readiness-baseline.log`: **9 failed, 27 passed**, exit 1. This is a reproducible code-boundary failure using simulated account objects, not evidence that a particular real Stripe account lost funds.

Official Stripe sources verified 2026-10-11:

- [Account capabilities](https://docs.stripe.com/connect/account-capabilities): destination charges use transfer capability; capabilities must be active, and sandbox enforcement can differ. The same source documents `legacy_payments` as enabling transfers during capability migration, including when modern transfers are inactive.
- [Account object](https://docs.stripe.com/api/accounts/object): `charges_enabled` describes charge processing, not explicit destination-transfer capability evidence.
- [Existing Express integration](https://docs.stripe.com/connect/express-accounts): omitting capability requests uses the platform's Dashboard onboarding configuration. Omission alone is therefore not recorded as a proven creation bug. Existing request parameters/idempotency keys are preserved; no account recreation, capability mutation, terms acceptance, or migration to another Stripe account API occurs here.

## Repair

The shared readiness helper additionally requires active `transfers` OR active `legacy_payments`. Existing details/charge/payout/deletion conditions remain required. Current-provider reads under the existing profile locks consequently update the persisted readiness flag consistently across checkout, trainer status and webhook processing. A delayed active event cannot restore readiness when the current provider lookup reports inactive transfers.

Both Connect status APIs expose `transfersEnabled`: null when unverified/unlinked, false when the verified account lacks supported transfer capability, true for modern or legacy support. The client contract requires that field, and both trainer screens check it independently before displaying Payments ready. Trainers see Transfers enabled/not enabled; missing fields yield unverified status. Existing identity and onboarding links remain available to resolve setup, without silently creating replacement accounts.

## Verification Ledger

| Steps / expected result | Actual result | Status / evidence |
| --- | --- | --- |
| Reproduce false readiness and attempted checkout without transfer evidence | 9 failing regressions | Proven above |
| Focused helper, checkout, status contract, prior readiness and signed webhook tests | 76 passed / 5 files, 3.84s, exit 0 | PASS; `.postgres-test/transfer-readiness-focused.log` |
| Final full lint/type/unit/build gate including navigation repair | 1,290 units / 60 files; 76-page optimized build, exit 0; existing lint warnings | PASS; `.postgres-test/transfer-readiness-check-final.log`; earlier transfer-only gate also passed |
| Real PostgreSQL current/legacy status, cache revocation/recovery, onboarding identity and concurrency | 30 focused tests passed; full suite 396 passed / 12 files, 71.35s, exit 0 | PASS; `.postgres-test/transfer-readiness-focused-sql.log`, `.postgres-test/transfer-readiness-full-sql.log`; provider reads simulated, persistence real |
| Focused desktop/mobile dashboard/payout readiness | 8 passed, 58.2s, exit 0 | PASS; `.postgres-test/transfer-browser-focused.log` |
| Broader transfer-only build: Connect, payout, dashboard, booking outcome and checkout recovery | 64 passed / 5 files, 7.9m, exit 0 | PASS; `.postgres-test/transfer-browser-full.log`; navigation repair is not in that optimized build |
| Focused navigation/draft-retention retest after rebuilding | 6 passed, 34.1s, exit 0 | PASS; `.postgres-test/profile-navigation-final.log` |
| Final rebuilt browser suite: Connect, payouts, parent/trainer dashboards, booking outcomes, checkout recovery, saved profile edits and selected navigation | 72 passed / 7 files, 8.7m, exit 0 | PASS; `.postgres-test/transfer-browser-final.log`; 1440px/390px; final typecheck also exit 0 |
| Hosted exact-source deployment and access smoke | Ready source `820f6b9`; anonymous Connect/checkout denied, unsigned webhook denied; parent refresh and trainer-page denial passed | PASS for these boundaries only; publication details below |
| Actual trainer Connect onboarding, paid booking, destination transfer and bank payout | Not performed | NOT VERIFIED |

## Remaining Gates

The owner PARENT session was freshly observed during this pass with one Sandbox Athlete and zero bookings; it remains intact. After reloading Stripe sandbox `acct_1RAkm8PvdPuIlEw5` `/test/connect/accounts`, the loaded DOM showed All 0, Restricted 0, Enabled 0, No connected accounts and Sandbox. A transient accessibility stale-page capture was resolved by observing the loaded DOM, not by inventing account state. No trainer password or terms were entered on the owner's behalf. A real hosted trainer account, approval/catalog and completed Connect onboarding are still needed to validate actual payment delivery. Package purchase/credits, unpaid hold policy/implementation, operational recovery and other release gates remain open.

## Mobile Navigation Finding

The focused 390px screenshot also exposed the selected Earnings & Payouts button outside the horizontal profile-navigation viewport on direct entry. The payout content itself rendered, but its selected navigation label was invisible. A ref/effect now scrolls the active button into the nearest visible position after profile loading and selection changes; it does not reload profile data or reset drafts. A six-case desktop/mobile regression covers Services, Availability and Earnings & Payouts direct links, subsequent navigation and unsaved-headline retention.

Baseline against the still-running optimized build compiled BEFORE the navigation repair: **2 failed, 4 passed**, 54.4s, exit 1 (`.postgres-test/profile-navigation-baseline.log`). Mobile Availability had visible viewport ratio 0.4201; mobile Earnings & Payouts had ratio 0, expected 1 for both. Desktop cases and mobile Services passed. The source edit existed on disk but was deliberately not rebuilt until after this baseline, so these results reflect the pre-fix rendered application.

After rebuilding, the first retest had four passes and two strict-100%-visibility failures (`.postgres-test/profile-navigation-retest.log`): actual ratios 0.9971975 and 0.9997462 at native scroll edges, with the selected controls visibly present. The test now allows subpixel rendering tolerance using a 0.99 visibility ratio; both original baseline ratios would still fail. The subsequent focused rerun passed all six, including unsaved draft and horizontal-overflow assertions. No timeout was increased and no behavioral assertion was removed. Existing cached readiness is refreshed on provider reads; this pass performs no historical backfill or schema migration.

## Visual Evidence And Local Cleanup

Final screenshots were opened and inspected, then copied unmodified into `evidence/transfer-capability-20261011/`: [mobile navigation before](evidence/transfer-capability-20261011/mobile-payouts-before.png), [mobile payouts after](evidence/transfer-capability-20261011/mobile-payouts-after.png), [desktop payouts](evidence/transfer-capability-20261011/desktop-payouts.png), [mobile dashboard](evidence/transfer-capability-20261011/mobile-dashboard.png), [desktop dashboard](evidence/transfer-capability-20261011/desktop-dashboard.png). Transfer-unavailable states show Setup in progress, not Payments ready. Mobile selected payout navigation is now visible. These are local synthetic provider-state screenshots, not actual Stripe receipts or a full accessibility signoff.

After the final browser run, an independent SQL query confirmed database `trainr_audit_timezone_20261011`, role `trainr_test`, and guard purpose `disposable integration database`. Counts for users, bookings, payments, packages, package items, services, sports and Connect attempts were all zero. The owned local Next server and PostgreSQL process were stopped. Hosted parent data and provider accounts were not deleted or changed.

## Publication And Hosted Retest

- Source commit `820f6b92814b9ab84f3aac891cae14dd8bf089e3`, `fix: require transfer capability and reveal active mobile profile tabs`, pushed only to `codex/payment-readiness-20261006`. Worktree was clean and remote-tracking SHA matched after push.
- Vercel [deployment UJuqit6tPqi7g3p1tau8KPF7hUBS](https://vercel.com/styleres-projects/trainr/UJuqit6tPqi7g3p1tau8KPF7hUBS) observed Ready at approximately 12:30 UTC, duration 1m6s, source exactly `820f6b9`. Details visibly mapped unique `trainr-7wheui89g-styleres-projects.vercel.app` and the stable audit branch alias. No production promotion/domain change occurred.
- Anonymous hosted requests at 12:31:43-44 UTC: GET `/api/payments/connect` and `/api/trainer/stripe-connect` returned 401 Unauthorized with private/no-store; POST `/api/payments/checkout` empty JSON returned 401 Unauthorized; POST `/api/payments/webhook` empty JSON without signature returned 400 Missing stripe-signature header. Initial restricted-shell network attempts could not open sockets, so no application result was inferred; the approved network retry above completed successfully. No credential, booking identifier or payment data was sent.
- Owner-authenticated PARENT browser on this deployed source: refresh retained one Sandbox Athlete and zero bookings. Direct navigation to `/trainer/profile?tab=payouts` redirected to `/parent/dashboard` with the same saved state. PASS for persistence display and role-page denial. No password/session change, agreement acceptance or hosted write was performed.
- Authenticated hosted trainer readiness and actual provider-backed booking/transfer/payout remain NOT VERIFIED. Local simulated capability and fault tests are not relabeled hosted Stripe tests. No fresh hosted SQL count is claimed this pass. This documentation follow-up changes no application source; production readiness stays **HOLD**.
