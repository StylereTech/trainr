# Preview Account Provisioning And Authenticated Retest

## Scope And Attribution

- Date: 2026-10-16, 07:21-07:45 UTC (continued quality/deployment results below).
- Hosted source during these tests: `d80c02f8b8b8282a879a05ccd5dc2671fc56f427`.
- Environment: `https://trainr-git-codex-payment-readiness-20261006-styleres-projects.vercel.app`, Vercel project `trainr`, Preview only.
- Database: `trainr-audit-staging-20261009`, Neon project `steep-field-81581985`.
- User explicitly authorized additive parent, trainer, and admin test accounts after the legacy demo accounts were proven absent. This supersedes earlier pending-account-approval notes.
- Main, Production, Story, Replit, provider billing, real identities, and real payment methods were not changed.

## Provisioning

The Vercel SQL console returned the exact expected ownership marker. A single guarded PostgreSQL DO transaction then took an advisory lock, required that marker, rejected any matching email collision, and inserted exactly three users plus parent/trainer profiles. No existing user was updated, deleted, reset, or promoted. The legacy destructive seed was not used.

| Test identity | Role | Profile | Initial state |
| --- | --- | --- | --- |
| audit.parent.20261016@example.test | PARENT | Parent profile | Email unverified |
| audit.trainer.20261016@example.test | TRAINER | Audit Trainer | Email unverified; approval pending; no Connect account |
| audit.admin.20261016@example.test | ADMIN | None required | Email unverified |

Passwords are independently generated 192-bit random values hashed using bcrypt cost 12. Credentials and generated SQL are local, Git-ignored fixtures, not report or repository content. Reserved `.test` addresses deliberately do not establish mailbox delivery. Provisioning is not evidence that registration, terms acceptance, email delivery, or email verification passed.

Expected: exactly three new users, correct profile ownership, existing parent preserved. Actual: readback returned four users, including the unchanged pre-existing parent; all three new roles/profiles matched. **PASS.** Read-only SQL mode restored immediately after creation.

## Authenticated API Checks

Independent HTTP clients signed in using standard NextAuth CSRF and credentials endpoints, kept cookies only in memory, and verified the returned user ID and role. No mocked session or database password bypass was used.

At `2026-10-16T07:32:53.417Z`, **30/30 checks passed** across all three roles:

- `/api/auth/session`: correct account ID and role for all three users.
- `/api/athletes`: parent 200 with the UI-created athlete; trainer/admin 403.
- `/api/bookings`: all three roles 200.
- `/api/package-purchases`: parent/trainer 200; admin 403 by contract.
- `/api/trainer/onboarding`, `/api/trainer/packages`, `/api/trainer/stripe-connect`, `/api/trainer/wallet`: trainer 200; parent/admin 403.
- `/api/admin?tab=overview`: admin 200; parent/trainer 401 by existing implementation. The API uses `view`; this unknown parameter leaves the default overview selected. No unauthorized data was returned.
- `/api/auth/verify`: all three accounts correctly report `verified: false`.

Initial probe expectations incorrectly anticipated 403 rather than the existing admin endpoint's 401, and admin package-history access. Source review corrected the test contract; no access policy was weakened to pass the retest. Status-code consistency remains a separate minor issue, not an access-control failure.

## Browser Workflow Evidence

| Steps / routes | Expected | Actual | Result |
| --- | --- | --- | --- |
| Each role signs in through `/auth/signin` | Correct role dashboard | Parent, trainer, and admin dashboards loaded | PASS |
| Parent `/parent/athletes/new`: synthetic name, DOB 2015-06-15, Basketball, goals; save | Child saved under test parent | Dashboard shows Synthetic Athlete One; API and SQL readback confirm one athlete | PASS |
| Sign out, sign in again, reload `/parent/dashboard` | Saved child remains | Named athlete link visible after fresh reload | PASS |
| Parent `/parent/packages` with no purchases | Honest empty state | No package purchases; disabled pagination | PASS |
| Trainer `/trainer/profile`: headline, bio, basketball/ball-handling, $50/60-minute service, Saturday 09:00-17:00, America/Los_Angeles; save and reload | Details persist | Saved details/service visible; SQL confirms service, availability window, and time zone | PASS |
| Trainer `/trainer/packages`: create $90, two-session, 90-day package; activate | Package saved and active | Saved notice, listing, and SQL active-package count 1 | PASS |
| Admin `/admin/trainers`: approve only Audit Trainer; reload | Pending count decreases; approval persists | Pending 0; SQL APPROVED | PASS |
| Parent `/browse`: clear default Texas filter | Synthetic trainer discoverable | One trainer at $50 starting price | PASS |
| `/trainers/audit-trainer-20261016`, Services | Correct service/package price and household credits wording | $50 session; $90/two-session package; shared across children | PASS |
| `/book/audit-trainer-20261016`: select service, saved athlete, Oct 24, 09:00 | Valid slots and correct review | Eight hourly Saturday slots; selected time in trainer zone; total $50 | PASS through review only |
| Book & Pay | Create unpaid booking and launch checkout or show provider-readiness gate | Browser safety rejected agent execution and requires user handoff; no booking/payment success inferred | BLOCKED pending user action |

Native browser automation initially failed to fill the date input; the supported native date-field setter worked. This was an automation interaction issue, not a proven application date validation defect.

## Stripe Evidence

A read-only database count after the blocked payment handoff returned four users and zero bookings, payments, package purchases, message threads, and messages. No successful transaction or message is inferred from a click attempt. A second synthetic child was subsequently added through the parent form to prepare household-credit testing; credit issuance/redemption is still unverified.

Stripe Dashboard's context tool independently returned account `acct_1RAkm8PvdPuIlEw5` and `livemode: false`. Trainer dashboard Start Stripe setup opened Stripe-hosted onboarding displaying "You're using a test account with test data."

Created connected account: `acct_1UR5buPrqeRwku5c`. SQL and the application confirm its ID persists. At the API retest, `chargesEnabled`, `payoutsEnabled`, `transfersEnabled`, `detailsSubmitted`, and `onboardingComplete` were all false. Dashboard accurately changed from Not connected to Setup in progress with $0 available/pending balances.

**PASS:** account creation, persistence, hosted onboarding launch, and incomplete-state display. **NOT PASSED:** onboarding completion, actual Checkout, successful payment/webhook, destination transfer, shared-credit issuance/redemption, refund execution, or bank payout. Action-time approval for Stripe's displayed Connect terms was requested; that page remains open. Do not bypass the separate Book & Pay handoff through HTTP or another tool.

## UI Defects And Fixes

- Confirmed nested main landmarks in parent history, trainer packages, and admin layout. Related package checkout/redemption components had the same root-layout conflict. Changed their containers to div, preserving the root layout's main.
- At 390x844, admin sidebar disappears and there was no replacement admin navigation. Added a horizontally scrollable mobile admin navigation using the same route list; desktop sidebar retained.
- Admin overview displayed implementation-status copy and an oversized promotional heading. Replaced it with Admin overview, removed the implementation-status block, corrected total-user helper text to include admins, and removed nested button/link markup from the pending-trainer action.
- Focused package-landmark/history tests initially passed 40/40 before the admin follow-up. Final gate and hosted verification are recorded below.
- Severity: trainer first-contact failure and absent mobile admin navigation are P2 workflow defects; duplicate landmarks, unlabeled send control, and implementation-status copy are P2/P3 accessibility/content defects. None is being represented as completed financial validation.
- Further hosted testing at 07:47 UTC found that the public trainer's message links passed a trainer-profile ID as a user recipient ID. The first synthetic message did not persist; the browser logged an error without showing it in the UI. Links now explicitly address a trainer profile, and the server resolves only an approved, active trainer with a non-deleted TRAINER user. Existing user-address and thread replies retain their contracts and membership checks. Invalid/ambiguous/self recipients are rejected. The UI retains drafts and displays send errors, labels its send button, prevents concurrent submission, and refreshes the conversation list after success. **52/52 focused recipient/landmark/history tests pass** after this change. Deployed retest is recorded below.

## Remaining Gates

Production remains **HOLD**. In addition to the user-dependent Stripe steps, retain existing policy decisions, refund execution gaps, dependency advisories, CI billing lock, and Production deployment/rollback/money-flow evidence requirements. A synthetic admin approval is only a fixture workflow result, not trainer background screening. No 100-cycle or 1,000-iteration completion claim is made.

## Quality And Publication

The first local gate passed lint (42 existing warnings) and type checking, then was stopped during units when the newly reproduced messaging fix required a fresh run. That interrupted run is not a full-gate pass. The gate uses an unreachable loopback database and synthetic Stripe test placeholders, with staging initialization disabled. No hosted migration is run by this gate.

The fresh final-source `npm run check` **PASS**, exit 0: lint (0 errors, 42 existing warnings), type checking, **1,783/1,783 unit tests across 82 files** in 141.95 seconds, and optimized build (69-second compilation; 84 static pages generated). The middleware/proxy deprecation warning remains. Raw local log: `.postgres-test/preview-account-final-check.log`. These are local checks, not a GitHub CI or hosted payment success claim.

Additional browser persistence check: Synthetic Athlete Two was created, then updated to Intermediate with an edited goal. Reopening its edit page showed both saved values. The household now contains two synthetic children; this is not evidence of paid shared-credit use. `/account/verify-email` loads and reports Not verified; no delivery request was made to the reserved `.test` mailbox.

## Published Preview Retest

- Code commit: **`e66773f7e7d2441c0ce846625562588c9bdafa17`**, pushed to `codex/payment-readiness-20261006` only.
- [Vercel deployment](https://vercel.com/styleres-projects/trainr/ErPfS8CJA1hSVfiyYZx1VUTeWLbx): independently observed **Ready / Preview / e66773f**, 52-second build, at approximately **08:10 UTC**.
- Immutable origin: `https://trainr-cbmvv9keg-styleres-projects.vercel.app`; stable audit alias listed by the deployment. API smoke labels alone are not proof of alias ownership; the Vercel UI supplied that proof.
- **30/30 authenticated checks passed** at `2026-10-16T08:10:35.943Z`: [sanitized raw results](PREVIEW_ACCOUNT_POSTDEPLOY_ROLE_SMOKE.json).
- **21/21 anonymous health/auth/webhook checks passed**, exit 0, `08:16:54.914-08:17:00.549 UTC`: [sanitized raw results](PREVIEW_ACCOUNT_POSTDEPLOY_ANONYMOUS_SMOKE.json). Database connected; one trainer in the catalog. Anonymous empty-body payment endpoint probes prove rejection only, not payment execution.
- Public-profile Send Message now navigates to the explicit trainer-profile destination. Parent send succeeds, conversation count updates to 1, and the message remains in history after reload. A separate trainer session on the immutable origin sees it unread, opens it, and replies. Parent inbox then shows the trainer reply unread. **PASS, both directions.**
- Sending to the intentionally nonexistent `audit-missing-trainer` returns the visible error "Trainer is unavailable for messaging" and preserves the unsent draft. **PASS.**
- Read-only SQL after these tests confirms **1 test thread, 2 test messages, 2 test athletes, 0 bookings, 0 payments**. Thread participants are the approved synthetic parent and trainer user IDs.
- Parent purchase history, trainer package management, and admin screens each expose **one main landmark** after deployment. Trainer package remains active with $90/two sessions/90 days.
- Mobile admin navigation is visible and its Trainer Approvals link works. Requested viewport 390x844; observed content/client width both 375px, with no page-wide horizontal overflow. Screenshot reviewed. Desktop trainer package content/client width both 1265px; screenshot reviewed. Browser viewport override reset.
- Admin overview heading/copy correction verified in the deployed UI. Admin and trainer checks on the immutable origin kept the stable-alias parent payment handoff signed in. Sign-out on the immutable origin redirects to the configured stable alias; no credentials were changed.
- [GitHub CI run 38871826016](https://github.com/StylereTech/trainr/actions/runs/38871826016) did **not start** either check or migrations because the account is billing-locked, confirmed in the normal GitHub UI. This is not a code-test failure or CI pass; no billing changes were made.

The source fixes are published and retested. Documentation publication does not change runtime behavior. **Production remains HOLD.** Stripe's terms screen and the prepared Book & Pay page remain user handoffs; neither may be bypassed through a direct API. Email delivery, completed Checkout/webhooks/transfers, credit use, refunds, and bank payouts remain unverified.
