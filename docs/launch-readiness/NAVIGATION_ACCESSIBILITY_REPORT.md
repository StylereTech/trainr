# Navigation Accessibility Report

## Scope

- Date: 2026-10-11 UTC; baseline `84869e756157b2735f9f86bf55903c26ff0453f9` on `codex/payment-readiness-20261006`, initially clean worktree.
- Environment: optimized loopback build at `http://127.0.0.1:3108`, Chrome at 1440px and 390px, existing guarded disposable PostgreSQL `trainr_audit_timezone_20261011` on 127.0.0.1:55439. Synthetic `@example.test` accounts only.
- Routes: shared header via `/browse`; parent/trainer dashboards, athlete creation, trainer public profile, booking authentication links, payout-profile navigation, and role-specific dashboard destinations. No schema, financial/provider, account-credential or business-policy change.
- Overall production readiness remains HOLD. This is a navigation semantics repair, not full accessibility or Stripe money-flow signoff.

## Finding And Fix

The authenticated hosted parent dashboard exposed Find Trainers and Add Athlete as both a link and a nested button. Source inspection found the same pattern in the shared signed-in/signed-out navigation, parent empty-state/review actions and trainer-profile booking/message links. A nested interactive control creates an invalid interaction hierarchy and duplicate focus targets.

The repair uses the existing Radix-backed `Button asChild` API to style the actual Next Link, preserving destinations, sizes, icons and mobile-menu close handlers. Payment, retry, menu-toggle and sign-out commands remain buttons. No new component abstraction or dependency was introduced. Other page surfaces are not implicitly certified by this scoped pass.

## Verification

The first baseline attempt failed all eight cases before reaching the UI because the database started on default port 5432 while fixtures expected audit port 55439. That process was stopped and restarted with explicit `-p 55439 -h 127.0.0.1`. This is a local setup failure, not evidence of eight application defects. `.postgres-test/navigation-baseline.log` retains the failed setup; the unchanged production build was reused for the corrected baseline.

The corrected baseline tests navigate to the real local catalog using anonymous/PARENT/TRAINER/ADMIN sessions, open the menu on mobile, require one visible destination link and no nested interactive controls, then test Tab/Enter behavior. All eight cases failed on the nested-control assertion, exit 1 (`navigation-baseline-retest.log`). Captured parent-desktop baseline: expected zero nested controls, received two (Dashboard and Account).

The initial repair passed `npm run check`: 1,290 unit tests / 60 files, fresh types, production build; lint retained the existing 43 warnings. All 54 affected browser cases passed in 3.0m, exit 0 (`navigation-focused.log`). That run verified the original header/dashboard/public-profile changes; it is not mislabeled as the final five-link extension's test. The following source scan found and repaired two booking authentication links and three trainer dashboard/profile/payout links. Final-source verification, screenshots, cleanup and publication are pending below.

A structured TypeScript JSX scan also found remaining instances in other account recovery, admin and informational-page surfaces. This report does not claim site-wide removal; they remain follow-up audit work.

Final source quality gate (`navigation-final-check.log`) passed: lint zero errors/43 existing warnings, freshly generated route types, TypeScript, 1,290 unit tests in 60 files and the 75-page optimized build, exit 0. The complete SQL suite (`navigation-sql.log`) passed all 396 tests in 12 files in 58.29s, exit 0. The complete local browser suite passed **260 cases in 19.3m**, no failures/skips, exit 0 (`navigation-full.log`, `navigation-full-results/`). All raw outputs are under ignored `.postgres-test/`. The full browser command was `node node_modules/@playwright/test/cli.js test 'local.*\.spec\.ts$' --workers=1 --reporter=list`, with the guarded loopback environment above.

The final build's eight navigation cases passed for all four account states at both widths. They assert one visible role-appropriate link, no nested link/button elements in the header, Tab leaving the link rather than entering a child, Enter reaching the correct destination, mobile-menu closure and no horizontal overflow. The final dashboard cases also passed, including keyboard activation into athlete creation and the trainer payout profile. Public profile responses and selected failure states are mocked; fixture authentication and dashboard persistence use real local HTTP/SQL. No provider transaction is established by these tests.

The unmodified [desktop parent navigation](evidence/navigation-20261011/desktop-parent-navigation.png) and [mobile parent navigation](evidence/navigation-20261011/mobile-parent-navigation.png) captures were opened and visually inspected: menu/control text fits, with separated actions and no text overlap in the captured viewports. These are scoped visual evidence, not a complete accessibility certification.

## Cleanup And Publication

At approximately 16:06 UTC, independent psql readback matched the exact disposable database, `trainr_test` role and `disposable integration database` guard. Counts were zero for users, bookings, payments, packages/items, services, athletes, checkout attempts, refunds, trainer wallets, wallet entries and withdrawal requests. The owned local app server and PostgreSQL instance were stopped. No hosted record was deleted. Local password-reset email-unavailable logs are expected with the provider disabled, and do not establish hosted delivery.

Source `440c4a31303113c4cc3b77566d23c7951bcfd291` was committed and pushed to `codex/payment-readiness-20261006`; HEAD and the remote-tracking branch matched and the worktree was clean before this documentation follow-up. The final standalone `tsc --noEmit` also passed, including the screenshot assertion added after the build gate.

Vercel [deployment 7TxeqAhGuGhEDvXGbTKNs16Vm3xT](https://vercel.com/styleres-projects/trainr/7TxeqAhGuGhEDvXGbTKNs16Vm3xT) was visibly Ready at 16:08:39 UTC, duration 43s, source exactly `440c4a3`. Its details mapped both `trainr-p1cadgrx3-styleres-projects.vercel.app` and the [stable audit Preview](https://trainr-git-codex-payment-readiness-20261006-styleres-projects.vercel.app). No main, Production, Story, provider configuration, credentials or domain mapping was changed.

Hosted retest on that source, approximately 16:08-16:09 UTC:

| Account / steps | Expected | Actual | Status |
| --- | --- | --- | --- |
| Existing owner PARENT: refresh `/parent/dashboard` | Session and saved athlete retained | One Sandbox Athlete, zero bookings; Find Trainers/Add Athlete are single links; zero nested main controls | PASS limited readback |
| Same account: open mobile menu, inspect header, press Enter on Dashboard | Single links and menu closes | Zero nested header controls; button returns to Open navigation | PASS |
| Same account: press Enter on Add Athlete | Athlete form loads | `/parent/athletes/new`, Add athlete heading and labelled fields rendered; no form submission | PASS navigation only |
| Same account: return, visit `/trainer/profile` | Parent cannot access trainer profile | Redirects to `/parent/dashboard`; captured error log empty | PASS |
| Anonymous GET `/api/bookings`, `/api/trainer/onboarding`, `/api/payments/connect`, `/api/admin/users` | 401 | Four 401 Unauthorized responses at 16:08:58-59 UTC | PASS |
| Anonymous POST `/api/payments/webhook` with `{}` and no signature | Reject before provider processing | 400 Missing stripe-signature header at 16:08:59 UTC | PASS; no valid financial event |

Fresh [GitHub Actions run 38154166858](https://github.com/StylereTech/trainr/actions/runs/38154166858) completed with failure before executing checks. The authenticated run page explicitly says both jobs were not started because the account is locked due to a billing issue. This external CI blocker is not a green check and is not relabeled as a code-test failure; no billing setting was changed.

Hosted authenticated TRAINER/ADMIN workflows, listing-to-paid-booking, webhook delivery, actual destination transfer and payout remain NOT VERIFIED. The local synthetic fixture results above do not substitute for them. This follow-up contains publication evidence only, with no additional application change.

## Separate Package Gate

Fresh schema/service inspection confirms package catalog management exists, but Payment is uniquely bound to Booking and no purchased-package entitlement/redemption ledger exists. Single-session checkout is not package purchasing. An owner question about single-athlete versus parent-shared session ownership is pending; no ownership/refund/expiry policy was invented during this navigation pass. Actual hosted trainer onboarding, paid sandbox booking, transfer and payout remain unverified.
