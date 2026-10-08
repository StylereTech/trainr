# Booking Action Authorization Audit

## Identity And Finding

- Date/time: 2026-10-08 UTC; reproduction and focused retests at 16:45-16:47.
- Baseline: `925e3bee41626b0a6e429071a76523cedb31bc5a`, branch `codex/payment-readiness-20261006`. Clean worktree verified before this pass. Previous shared-rate-limit publication was concrete progress.
- Environment: local source/tests and disposable PostgreSQL `trainr_audit_20261008`, loopback port 55439. Synthetic `audit-<UUID>` parent/trainer accounts and `booking-admin-<UUID>@example.test` admins only. Stripe provider responses are simulated in the SQL suite.
- P1 finding: `applyBookingAction` trusted the actor role captured before its transaction. A request already past route authentication could confirm, cancel, complete or mark no-show after that account's role changed or it was deactivated. Cached authority was also accepted for same-state retries. Route authentication alone did not serialize this interval with revocation.
- Status: local fix verified; publication evidence follows below. No production/money-flow signoff or main promotion.

## Fix

- Acquire a shared lock on the actor's user row before booking/payment locks. Read current role and `deletedAt` under that lock; missing, deactivated or changed-role actors receive `BookingActionError` 403 before booking lookup or mutation.
- Keep the user lock through transaction commit. Role/deactivation writers already lock users first, so an action and revocation have a defined database order. Preserve booking-before-payment order, ownership checks, financial eligibility, transaction rollback and idempotent authorized retries.
- Cancellation review notifications select only currently non-deactivated admins. Cancellation still does not imply a refund or transfer reversal.
- No schema migration, payment destination, amount, refund policy, scheduling policy or UI redesign changed in this pass. Session-version-only revocation during an already authenticated request is not covered by this role/deactivation fix.

## Verification

Affected routes: `PATCH /api/bookings/[id]` and booking mutations through `PATCH /api/admin/bookings`. The shared mutation helper is exercised directly with real SQL for deterministic races; this is not a live HTTP race or a claim that every privileged operation is covered.

| Test | Exact Steps | Expected And Actual |
| --- | --- | --- |
| Baseline reproduction | Cache parent/trainer/admin actor, change persisted role; separately deactivate each actor with a same-state retry; remove actor entirely | All 7 new rejection assertions failed against baseline because the action returned success. Existing 34 cases passed. Confirmed bug. |
| Focused unit/route retest | Run `vitest run tests/booking-actions.test.ts tests/booking-action-routes.test.ts --configLoader runner` after fix | 58/58 passed in 747ms. Rejection is 403, no status/statistics/notification/audit mutation; lock order explicitly asserted. |
| Revocation wins | Separate PostgreSQL client holds actor row FOR UPDATE; queue cancel (parent) or complete (trainer/admin); observe `pg_blocking_pids`; commit role change or deactivation, release, inspect result | All 6 role/deactivation combinations pass: queued action returns 403, booking stays CONFIRMED, payment stays SUCCEEDED, statistics/notices/audits unchanged. |
| Action wins | Hold booking row, start authorized completion, observe its actual lock wait; start role writer and observe it waiting on the action; release booking | Action commits once, role writer then commits, cached-actor retry returns 403. Exactly one completion statistic and notice. PASS. |

Focused guarded SQL command: `vitest run --config vitest.postgres.config.ts --configLoader runner tests/integration/postgres-payments.integration.ts -t 'queued|later revocation'`. **7 passed, 56 intentionally excluded by focused filter, 2.70 seconds**. The broader SQL run follows separately; filtered exclusions are not counted as passes. No arbitrary sleep establishes concurrency; tests observe real PostgreSQL blocking relationships.

## Timing Finding And Remaining Gates

Inspection also confirmed that bookings store a calendar date and wall-clock start/end strings, with no saved trainer IANA time zone or absolute session instant. Creation and Checkout lack a reliable start-in-the-past guard. Guessing UTC or a location-derived zone for existing schedules would risk changing their meaning. The owner has been asked which zones existing schedules use; new per-trainer time-zone selection, DST gap/fold policy, immutable booking instants, display labels and migration/reconciliation remain required. No time-zone default was silently introduced.

Real Stripe Checkout, destination transfer, Connect onboarding, refund and bank payout proof remain outstanding, along with isolated staging/correct-project deployment and documented product/security gates. The preceding source commit's hosted CI could not run due to GitHub billing. Recheck publication and live state below before relying on this report.

## Full Retest And Publication

- `npm run check` exited 0: lint with existing warnings, typecheck, all unit tests, Prisma generation and optimized build (compile 22.9 seconds; all 72 static pages generated).
- A compact full unit rerun at 16:51:32 UTC confirmed **782/782 tests across 43 files**, 9.07 seconds, exit 0.
- Full guarded SQL suite at 16:50:42 UTC: **216/216 tests across 9 files**, 34.09 seconds, exit 0. Expected CHECK/unique/FK errors are deliberate rollback probes, not failed test cases.
- Final built-app browser regression: **76/76 passed across 17 files**, exit 0, no retries or timeout changes. Chromium via local Edge ran at desktop/mobile widths, one file per process, one worker. Output root `test-results/booking-action-final`; dashboard actions passed 8/8 in 42.3 seconds. Loopback runtime used synthetic auth/Stripe values, empty email credentials, and `VERCEL=1` only to simulate trusted-header handling. This is not real Vercel-ingress or live Stripe evidence.
- Cleanup after stopping Next: exact database/guard verified; users, athletes, athlete/booking request records, bookings, payments, Connect attempts, admin actions and notifications all zero. A guarded disposable-only transaction removed 32 synthetic rate-limit buckets and verified zero remaining. PostgreSQL stopped successfully. No production data changed.
- Windows sandbox process creation remains unavailable (`CreateProcessWithLogonW failed: 1909`); scoped approved native commands and the same patch helper performed this pass. No OS account/settings were modified.
- Commit/push verification and read-only live smoke follow below after actual completion.
