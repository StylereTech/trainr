# Parent Staging Workflow Validation

- Date: 2026-10-11 UTC; this pass follows the owner's successful parent signup.
- Baseline: `dfd01db835118063725dbc4f9b7b4c089e1a8a32` on `codex/payment-readiness-20261006`; fixes described below are in this report's source commit.
- Environment: isolated Vercel `trainr` audit Preview, independent Neon `trainr-audit-staging-20261009`, Stripe test mode only.
- Browser origin: `https://trainr-git-codex-payment-readiness-20261006-styleres-projects.vercel.app`.
- Account: owner's staging parent account; address/password withheld. Synthetic athlete only, not a real child's information.
- Overall: **HOLD**. The following tests do not establish full booking, program purchase, Connect, or payout success.

## Real Parent Workflow Results

| Steps / route | Expected | Actual / evidence | Result |
| --- | --- | --- | --- |
| Verification page > Continue to dashboard | Existing parent session opens `/parent/dashboard` | Parent dashboard, 0 open bookings, 0 athletes, empty booking list | PASS |
| Add Athlete > submit blank `/parent/athletes/new` | Required name stops submission | Native validity false: `Please fill out this field.` | PASS |
| Enter synthetic Sandbox Athlete, birth date 2014-01-15, Soccer, goals and notes; Save | One profile created | Dashboard shows Athletes saved 1 and profile link `cmv3bs3xr0001jn0694fd2p2f` | PASS |
| Refresh dashboard and reopen profile | Saved fields survive a fresh page load | Edit form shows correct names, birth date, Beginner, Soccer, goals and notes | PASS |
| Add Basketball, select Intermediate, update goals; Save and reopen | Persist updates without duplicate athlete | Both sports checked, Intermediate selected, updated goals displayed | PASS |
| Independent read-only Neon SELECT for exact synthetic athlete ID | Database matches form | One row, birth date 2014-01-15, INTERMEDIATE and exact updated goals; 808 ms | PASS for inspected columns; sports also verified through reopened form |
| Parent requests `/trainer/dashboard` and `/admin` | No cross-role page access | Each resolves to `/parent/dashboard` | PASS page-role isolation, not API authorization proof |
| Open/Past booking tabs | Distinct accurate empty states | No upcoming sessions; No past sessions yet; pagination disabled at page 1/1 | PASS empty-state paths |
| `/notifications` | Empty inbox, no actionable read button | 0 unread, No notifications yet, Mark page read disabled | PASS empty-state display |
| `/messages` | Empty conversation list | No conversations yet; Select a conversation to start messaging | PASS empty-state display; message send/delivery NOT TESTED |
| `/browse` | Empty catalog from no onboarded trainers | 0 trainers and No trainers found | PASS reachable empty state; trainer selection/booking BLOCKED by missing trainer setup |
| Parent dashboard at 390x844 | Readable mobile content without horizontal overflow | Screenshot inspected; document scroll width 375 <= innerWidth 390; mobile menu opens | PASS this viewport/page only |
| Mobile menu > Sign Out | Session exits to public home | Home URL and Sign In link visible | PASS |

## Automation Failure And Retest

The initial automation `fill` did not retain the native date input value. Save was correctly prevented by required-field validation. Inspection confirmed an empty value, not a server failure. Native accessible date entry using ISO `2014-01-15` succeeded, followed by the successful save and persistence checks above. No application workaround or validation weakening was applied.

## Browse And Wording Findings

- Explore had no click handler. Fix: explicitly rerun the current search, with disabled state while loading.
- Non-2xx and malformed top-level responses were presented as a successful empty search. Fix: check response status/shape, show a retryable error, and avoid showing zero-result statistics as successful evidence.
- Overlapping searches could replace newer results with stale responses. Fix: abort the superseded request and ignore aborted completions.
- Clear Filters retained the default Texas filter. Fix: keep Texas as the initial default but clear all selected filters on the explicit clear/reset action.
- Filter select controls and remove icons lacked accessible names. Fix: names for all five selects/removal controls, expansion state for Filters, and pressed state for sports.
- Desktop messages navigation was unnamed and nested a button inside its link. Fix: one named Messages link using the existing Button `asChild` pattern, with a title tooltip.
- Messaging copy described the implementation as a premium shell rather than addressing users. Fix: Messages heading and concise conversation copy; removed the unsupported claim that new coaches join every week from browse.
- Additional open finding: `TrainerCard` still has a Save trainer button with no persistence behavior. Favorites are **INCOMPLETE**, not counted as passed. No completed program/credit purchase workflow is claimed.

## Email Isolation And Owner Handoffs

The signed-in service is Resend, not Replit. A broad inbox inspection was blocked to avoid exposing unrelated Story email data; only settings/team controls were subsequently inspected. Existing `stylere` configuration, keys and messages were not changed.

Create team > name TRAINR > Continue opens a paid-plan choice. The transactional Pro option is $20/month. No plan was selected, checkout was not submitted, and creation of a separate operational team is **not verified**. Owner approval for this subscription is pending. Resend's documented team isolation is described at https://resend.com/blog/multiple-teams; live UI pricing is the action-time evidence.

After parent sign-out, `/auth/signup?role=trainer` was prepared with Audit Trainer only. Owner must enter a distinct test email/password and complete terms/submission. No trainer account, profile approval, availability, Checkout, destination transfer, or payout was created in this pass.

## Verification Status

2026-10-11 04:45 UTC: `npm run check` completed with exit 0: lint (existing warnings), typecheck, **981/981 unit tests in 48 files**, Prisma generation, Next production build and **73/73** pages.

Started that production build on `127.0.0.1:3107` and ran `e2e/browse-local-regression.spec.ts` with Chrome, one worker. **8/8 passed**, 53.7 seconds: HTTP failure/retry, malformed top-level response/retry, Explore/filter clearing/accessibility, and superseded-request cancellation, each at 1440x900 and 390x900. Desktop/mobile screenshots were inspected; tested pages had no horizontal overflow. The local test server was stopped afterward.

These browser tests are localhost-only and mock catalog/session responses; they are not real Stripe or database proof. Real parent/Neon evidence is separately listed above. No production deployment, production database write, real charge, or paid Resend subscription occurred. Publication and deployed smoke remain pending at this recording time.
