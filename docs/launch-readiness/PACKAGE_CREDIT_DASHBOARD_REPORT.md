# Package Credit Dashboard Verification

## Scope

- Date: 2026-10-13 UTC. Baseline `77fdb354ccd6ac04526cd9d36991e61c25e705a7`; branch `codex/payment-readiness-20261006`.
- Environment: guarded disposable PostgreSQL `trainr_audit_timezone_20261011`, role `trainr_test`, loopback `127.0.0.1:55439`. Local UI uses synthetic `browser-*@example.test` accounts and explicit synthetic SQL receipts, not actual Stripe transactions.
- Surfaces: `/api/dashboard/bookings`, `/api/bookings`, `/api/admin/bookings`, `/parent/dashboard`, `/trainer/dashboard`, `/admin/bookings`, and the existing credit-aware booking action API.
- Main, Production, Story, Replit, hosted credentials, billing, real funds and binding account agreements excluded.

## Finding And Changes

Source inspection confirmed that dashboards interpreted a missing per-booking payment as unpaid even when a package redemption existed. They displayed `Payment not recorded`, a misleading zero-dollar session amount, and blocked trainer outcome controls. Neither parent nor trainer had a cancellation control for a confirmed credit-funded session. The preceding action integration did not repair this read/UI path.

Booking reads now project a small credit-funding DTO: type, owned purchase ID, immutable package title, restoration timestamp and generic hold message. Raw nested purchase/grant/receipt records and provider review details are not returned. The participant dashboard continues to use a transaction-consistent, explicitly selected response; admin reads are private/no-store. The action handler continues to verify locked database records, never the client DTO.

Participant/admin cards identify package credits separately from cash payments and show `1 session credit`, not a new $0 payment or payout allocation. Restored credits have explicit history wording, retaining original expiry and payment restrictions. Current financial holds disable outcome controls. Administrators cannot cancel credit sessions through the UI, matching the still-undefined admin adjustment policy.

Owning parents/trainers can cancel confirmed credit-funded sessions after a confirmation prompt stating the approved policy. Parents' early/late result remains server-authoritative; no refund is promised. Parent cancellation and checkout have an in-flight interlock. An uncertain cancellation response disables further actions until a successful read; a response with the wrong booking/status is not treated as success. Long package titles have constrained wrapping inside existing cards.

## Verification

1. Start only the existing owned loopback PostgreSQL cluster; no schema or dependency change.
2. Complete ledger/actions/dashboard integration file: **124/124 PASS**, 13.79 seconds, start **07:52:27 UTC**. Eleven new cases verify both participant projections, ownership denial, early/late history after reload, refund/review/unverified holds, immutable purchased title and absence of raw payment details. Log: `.postgres-test/credit-dashboard-focused-sql.log`.
3. Focused funding/payment-hold/dashboard/action-route units: **88/88 PASS**, four files, 2.27 seconds, start **07:52:42 UTC**. Log: `.postgres-test/credit-dashboard-unit.log`.
4. Initial TypeScript/route-generation check passed. Complete SQL regression: **860/860 PASS**, 16 files, 126.27 seconds, start **07:56:24 UTC**. Independent guard/cleanup reads showed users, bookings, purchases and credit redemptions all zero. Log: `.postgres-test/credit-dashboard-full-sql.log`.
5. Full `npm run check`: **PASS, exit 0**, **07:59:18-08:02:45 UTC**. Lint 0 errors / 42 pre-existing warnings; route generation and TypeScript pass; **1,535 units / 70 files**, 23.98 seconds, start 08:00:49 UTC; optimized build compiles and all 81 pages generate. Log: `.postgres-test/credit-dashboard-check.log`. The middleware deprecation remains; the previous Edge Runtime warning was not emitted in this run, which is not a demonstrated remediation. No migrations, dependencies or staging initialization settings changed.

### Visual Defect And Retest

The initial local browser/HTTP selection passed **74/74**, one worker, zero retries, 5.8 minutes, **08:03:23-08:09:15 UTC**. It covered 24 credit-dashboard cases, 20 cash outcome controls, 24 checkout-recovery cases and six credit-action HTTP cases. That result did **not** prove all panel geometry: screenshot review found a long sport name pushing a mobile athlete tile past its panel, despite the existing document-overflow assertion passing. The initial parent screenshot also stopped at the credit badge rather than showing its full funding details.

Added a tile-versus-panel boundary assertion and ran it against the unchanged built app. It **failed as expected** at 390px: tile right edge **369.5px**, containing panel right edge **358px**, an **11.5px overflow**. Focused test 6.2 seconds; log window **08:10:08-08:10:38 UTC**. Evidence: `.postgres-test/credit-dashboard-overflow-baseline.log`, `.postgres-test/credit-dashboard-parent-overflow-before.png`, and preserved `.postgres-test/credit-dashboard-overflow-failure` trace/screenshot/video. Cleanup independently returned all test row counts to zero.

Fix: explicit one-column/min-zero grid sizing, constrained athlete text, a nonshrinking avatar and wrapped sport names. Funding screenshots now scroll to the amount so the full card can be reviewed. Separately, cancellation response parsing now handles non-JSON or mismatched booking/status responses without claiming success or displaying gateway diagnostics; new desktop/mobile cases commit cancellation then replace its response with malformed HTML and require a successful refresh to recover. No money mutation or SQL logic changed after the 860-case pass. The full gate and expanded 76-case browser selection are being rerun; final results follow below.

### Corrected Quality Gate And Focused Recovery

The rebuilt application passed `npm run check`, exit 0, **08:11:43-08:17:30 UTC**: lint 0 errors / 42 existing warnings, TypeScript pass, **1,535 units / 70 files** (34.46 seconds), optimized compilation and all 81 pages. Log: `.postgres-test/credit-dashboard-check-retest.log`.

The next focused browser run passed the corrected mobile panel assertion but failed both new malformed-response cases. The actual cancellation warning was present; the test's unqualified `getByRole('alert')` also selected Next.js's hidden route announcer, causing a strict-mode violation. Preserved evidence: `.postgres-test/credit-dashboard-focused-browser-retest.log` and `.postgres-test/credit-dashboard-invalid-json-selector-failure`. The selector now identifies the warning containing the refresh button. No application change was needed for these failures.

Focused retest: **5/5 PASS**, 21.3 seconds, one worker, zero retries. Includes desktop/mobile lost-response and malformed-response recovery plus the corrected 390px parent panel boundary. Log: `.postgres-test/credit-dashboard-focused-browser-retest-2.log`. Final TypeScript check after the test edit passed; log `.postgres-test/credit-dashboard-final-typecheck.log`.

## Browser Steps And Expected Results

All accounts below are disposable local fixtures, with provider status intercepted. Desktop viewport 1440x1000; mobile 390x1000. Each test independently cleans its owned rows.

| Actor / steps | Expected result |
| --- | --- |
| Parent, trainer, admin: open the relevant dashboard with clean, held and restored credit sessions | Correct package title, credit amount and hold/restoration wording; no second payment or Pay now; long labels remain inside their panels |
| Same actors: GET role dashboard, `/api/bookings` and admin list where authorized | Private/no-store response, safe funding projection, no nested purchase/receipt or private provider review |
| Parent/trainer: accept cancellation confirmation, open history, reload | Server-saved CANCELLED and restored credit visible; exactly two participant notifications; no new payment/wallet entry |
| Parent: cancel within 24 hours; normal, dropped and malformed success response | Credit remains consumed; uncertain responses lock further action until successful refresh; no gateway diagnostic shown; exactly one parent notification |
| Trainer: load clean session, advance browser clock, add financial hold independently, select Complete | Server rejects action, session remains CONFIRMED, no notification, private review details stay hidden |
| Admin: inspect credit session actions | Credit cancellation disabled until an administrator adjustment policy exists |

Results for the complete selection are recorded in Final Gates And Publication below, not inferred from this expected-result table.

## Remaining Gates

This repairs existing credit-funded booking reads/actions. Test sessions are seeded through guarded local SQL, not public purchase or reservation APIs. Public package checkout/reservation/redemption, spendable-balance selection, replacement/retirement of prepaid services, pending expiry interpretation, and actual signed-in hosted Stripe/Connect/payout proof remain incomplete. Public package sales remain disabled. Email setup remains deferred. Existing dependency findings, CI execution failure and the prior Next.js Edge Runtime warning are not waived by these changes.

The prior hosted browser approval-service interruption is not bypassed; no signed-in hosted action or blocked Vercel log is accessed through an alternate surface. Overall production status: **HOLD**.

## Final Gates And Publication

Final selected browser/HTTP regression: **76/76 PASS**, one worker, zero retries, 6.4 minutes, **08:23:26-08:29:53 UTC**, exit 0. This includes all 26 credit-dashboard cases above, six existing credit-action HTTP cases, 20 cash outcome controls and 24 checkout-recovery cases. Log: `.postgres-test/credit-dashboard-browser-retest.log`. All expected results in the browser table matched. These are selected regression files, not a claim that every application workflow or real provider transaction passes.

Reviewed and preserved [parent mobile funding/panel](screenshots/credit-dashboard-parent-390.png), [trainer desktop financial hold](screenshots/credit-dashboard-trainer-held-1440.png) and [admin mobile controls](screenshots/credit-dashboard-admin-390.png). Long titles wrap, the athlete tile remains inside its panel, and visible labels/controls do not overlap. The admin clean screenshot intentionally advances only the browser clock; server-time rejection is separately tested.

Independent guard/cleanup query confirmed the disposable database marker and zero users, bookings, payments, package purchases, grants, receipts, redemptions and sports. The local Next server stopped. Restricted PostgreSQL shutdown initially lacked permission to signal its owned process; scoped elevated shutdown succeeded. Both owned local servers are stopped.

Pre-publication remote read confirms audit branch at baseline `77fdb354ccd6ac04526cd9d36991e61c25e705a7` and main unchanged at `2067e743c54ffee669cd484f26dc472b157f1881`. Source publication and post-push evidence follow; local results alone do not establish hosted or production readiness.
