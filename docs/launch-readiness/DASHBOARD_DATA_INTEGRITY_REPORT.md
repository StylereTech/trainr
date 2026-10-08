# Dashboard Data Integrity

## Scope

- Date/time: 2026-10-08 UTC, starting 08:38; final retest/publication follows below.
- Baseline SHA: `0dfd7a19e9155facc7be7a95e41cb741fb5ba0be`, plus the commit containing this report.
- Environment: isolated Windows checkout, Node 22, built Next.js on loopback port 3107; guarded disposable PostgreSQL `trainr_audit_20261008` on port 55439. No production DB write or real financial action.
- Accounts: generated parent/trainer/admin `example.test` fixtures, removed after tests. External Stripe observations mocked; production smoke anonymous only.
- Goal status: active. This pass closes dashboard data defects, not remaining registration/child/cancellation/timezone/Stripe/Connect/payout/deployment gates.

## Findings And Fixes

1. HIGH: dashboards fetched only the default first ten bookings, then calculated supposedly account-wide counts and history from that page. Added `/api/dashboard/bookings` with bounded role-specific server pagination, counts across every owned booking, stable ordering, explicit projection and one repeatable-read snapshot. All status groups remain reachable, including rescheduled history. Empty last pages clamp safely after a transition.
2. HIGH: failed or malformed responses became empty booking/athlete lists and zero statistics. Schema-validated reads now have bounded timeout, cancellation/generation protection, explicit unknown/error state and retry. Malformed data is not accepted as an empty account.
3. HIGH: trainer total earnings summed original allocations from at most ten completed bookings, regardless of refunds or provider settlement. Replaced it with the authenticated Stripe USD balance read: available and pending amounts, unknown on error, disconnected when provider says no account. Negative balances remain negative. This is not lifetime earnings, bank settlement or payout-ready proof. Booking pagination does not reissue the balance read.
4. MEDIUM: trainer action UI guessed the resulting status without reloading persisted payment/counts and allowed repeated actions after uncertain responses. It now reloads current server state after success, blocks another action after uncertainty, and recovers through explicit reload. Backend state-transition/idempotency/payment enforcement remains authoritative.
5. MEDIUM: payment state was not explicit on every history row, rescheduled parent bookings were hidden, favorites count was hard-coded zero, and page text claimed design completion. Added payment badges, retained refund distinctions, exposed rescheduled history, removed fabricated favorites/design commentary, and simplified headings/stat bands. Counts are labelled open bookings; no timezone/expiry inference was introduced.

## Verification Steps

| Route / exact operation | Expected | Actual / result |
| --- | --- | --- |
| `GET /api/dashboard/bookings?view=upcoming&page=1&limit=10` as parent with 36 real SQL bookings | 25 open bookings counted, ten returned, eight review opportunities | PASS; later pages return remaining owned records, stable order, no duplicate IDs |
| Parent past and trainer pending/confirmed/completed/all views | All statuses reachable; counts independent of page; role/profile isolation | PASS; historical count 11 includes RESCHEDULED, trainer all count 36; invalid roles/views/missing profiles reject |
| Read last pending page, move its two rows to CONFIRMED, request again | Clamp page and update global counts | PASS; page 2 -> 1, PENDING 12 -> 10, CONFIRMED 13 -> 15 |
| Store partial/pending/failed refunds and provider IDs; read dashboard | Persisted refund state visible, provider/credential/child DOB fields excluded | PASS; refund counters/time included, PaymentIntent/Connect IDs excluded; no fabricated earnings field |
| Invalid/extra query keys, anonymous requests, injected persistence failure | 400/401/503, never successful empty account or SQL diagnostics | PASS; strict query/current identity enforced; private no-store result |
| `npm run test:postgres` | Real SQL regressions plus prior locking/refund/account cases | PASS: 114 tests / 4 files in 13.86 seconds before final UI refinements; final rerun below |
| `npm run check` | Lint, types, unit tests, production build | 634 unit tests / 34 files passed; initial build generated 70 pages. Final source build below; existing unrelated warnings remain |
| Real HTTP/SQL parent/trainer workflows at 1440/390px | Navigate beyond ten records; change views; reload saved counts/actions | Eight focused cases passed in 28.5 seconds; 24 real bookings per populated fixture; only external Stripe reads mocked |
| Real trainer action commits but its browser response is dropped | No guessed status/automatic retry; block until reload | PASS; independent SQL shows completion, exactly one PATCH, explicit reload recovers current counts |
| Booking 503, malformed athlete response, Stripe 503, then retries | Error differs from empty/zero; retry restores data | PASS; provider retry shows -$25 available/$10 pending instead of zero or booked allocations |

First focused browser batch passed 16/20. Four error cases failed because an unscoped alert selector also matched Next.js's route announcer. Snapshots showed the correct application error. Scoped assertions to the real message and reran all eight new cases successfully. A build was intentionally stopped to finalize accurate open-booking labels. The subsequent build and initial report write hit proven `ENOSPC` in the local cache; cleared only resolved in-checkout `.next/cache` (about 398 MB) and reran. No user data or original dirty checkout was removed.

## Limits And Release Gates

### Publication Proof: 2026-10-08 09:11 UTC

- Source/report commit `08d78efc671a23ab73a12a50f31a2b0855a16e27` pushed to `origin/codex/payment-readiness-20261006`; `git ls-remote` matched local HEAD and worktree was clean before this evidence-only update. Main was not changed.
- Post-push anonymous production smoke: `https://trainr.cc/api/health` returned HTTP 200, `ok: true`, `dbConnected: true`; `/api/admin/bookings` returned HTTP 401. This tests the existing production deployment, not the new dashboard source or real money movement.
- GitHub Actions run `37754880968`, job `113236867962`: failure with zero steps. Exact annotation: "The job was not started because your account is locked due to a billing issue." Local test passes do not constitute a passing hosted CI run.
- Vercel preview `7FL2PNmiPvSiJnmmmUp4JNqULEL5` was PENDING at this observation. Do not treat this as deployed or runtime-tested. Production still requires the correct-project rollout and preceding migrations/rehearsal.

### Final Local Evidence

- Final retest, 2026-10-08 09:03-09:10 UTC: `npm run check` exited 0 with 634 unit tests / 34 files, lint, typecheck and 70 generated pages. Guarded `npm run test:postgres` passed 114 tests / 4 files in 20.24 seconds. Full `playwright test local-regression.spec.ts --project=chromium --workers=1` passed 47/47 in 3.1 minutes using installed Edge, including all eight new dashboard cases.
- Visually inspected eight final screenshots (`dashboard-top.png` and `dashboard-pages.png` for each role at 1440px and 390px), under ignored `test-results/dashboard-local-regression-*`. Headings, balances, payment badges, wrapped identifiers and pagination are readable; automated horizontal-overflow assertions passed. Existing mobile success toast overlays content transiently; this is not a comprehensive accessibility signoff.
- Cleanup verified independently at 09:10 UTC: users, bookings, payments, payment_refunds, admin_actions and notifications each contained zero rows. Test app and PostgreSQL stopped. No production records changed.
- Connect status loader and broader payout-history/admin financial pages were not redesigned by this pass; their remaining consistency/error handling remains in the full audit scope.

- API view name `upcoming` denotes the PENDING/CONFIRMED group, labelled **Open** in the UI. Timezone, overdue-state handling and automatic hold expiry are not implemented here.
- Counts and rows share one response snapshot; separate page requests observe later snapshots, not a frozen export. Refresh after concurrent changes.
- Existing `/api/bookings` remains for other clients; this pass does not claim its broader projection/filter surface was redesigned.
- Stripe wallet supplies the balance. This pass does not execute a charge/refund/transfer/payout, verify a real connected balance or prove a bank deposit. Provider/browser balances are simulated.
- No new migration. Existing checkout/session/account/refund migrations still require isolated staging rehearsal and correct-project rollout before this source reaches production.
- Prior baseline preview `14M7XrDCX1dbVV9aTTDJHfypEiF3` was rechecked SUCCESS, not runtime or production-domain proof. Current publication evidence follows below.
- Full audit remains open: actual Stripe checkout/Connect/destination transfer/refund/payout proof; durable cancellation/refund/credits; timezone/hold expiry; registration/email and complete athlete CRUD; remaining security/retention/demo-account remediation; staging drift/migrations; correct Vercel rollout; main publication and live write-flow tests. No production or final money-flow signoff.
