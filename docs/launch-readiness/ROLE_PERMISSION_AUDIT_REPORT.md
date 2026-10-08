# Role Permission Audit Report

2026-10-08 session-revocation update: API identity and NextAuth sessions now verify the current database role and session version. Password reset, self-deletion and role changes revoke older cookies; legacy cookies require fresh login. The legacy admin user listing excludes credential/reset fields. Baseline `6ba2929e0432faca904dbdfdbdaa439f896104fe` plus this commit. Exact account/route steps, real SQL/browser retests and production limitations: [session audit](SESSION_REVOCATION_REPORT.md). Admin mutation atomicity and last-admin races remain open; production is not yet remediated by this local patch.

2026-10-08 trainer-decision update: the mutation checks and holds the administrator's actual database role inside its transaction. Tests keep a synthetic ADMIN session after database role revocation and verify 403 without changes. Missing/non-admin sessions and malformed inputs also reject. **This is scoped to trainer-decision writes, not a completed platform-wide session/revocation audit.** [Source, exact steps and retest proof](TRAINER_APPROVAL_INTEGRITY_REPORT.md).

2026-10-08 public-data update: anonymous browse/search now query explicit public trainer/relation fields; public reviews no longer query parent account/email identifiers, and both profile pages display anonymous parent attribution. Source baseline `83fba060b23a73af95732668c2904422092a3127` plus this commit. **29 focused tests and 29 real local PostgreSQL tests passed**, with populated synthetic private fields, hidden reviews and inactive trainers. Exact steps, production-sample limits and final build/browser proof are in the [checkpoint](AUDIT_CHECKPOINT_2026-10-06.md). This does not complete the broader permission/privileged-session audit or prove production remediation.

> 2026-10-06 audit supersedes the readiness conclusions below. See [current checkpoint](AUDIT_CHECKPOINT_2026-10-06.md) for baseline SHA, environment, exact checks, fixes, open defects, and retest status. This document's April results are historical and do not establish current production readiness. Money movement is NOT signed off; fixable repository blockers remain.

- Date/time: 2026-04-24 00:55 UTC / 2026-04-23 17:55 America/Los_Angeles
- Environment tested: live production `https://trainr.cc`
- Commit SHA tested: final pushed commit `71edba76ac7070856ab5a1cffed0b40c9ea8a652`
- Accounts used: parent `jennifer.davis@email.com`, trainer `marcus.johnson@email.com`, admin `admin@trainr.app`

## Routes And Endpoints Tested
- `/parent/dashboard`
- `/trainer/dashboard`
- `/trainer/onboarding`
- `/trainer/profile`
- `/admin`
- `/admin/users`
- `/messages`
- `/api/trainer/onboarding`
- `/api/trainer/stripe-connect`
- `/api/admin/bookings`
- `/api/admin/coupons`
- `/api/trainer/wallet/withdraw`

## Steps
1. Ran role-boundary Playwright suite against live production.
2. Verified unauthenticated redirects.
3. Verified parent blocked from trainer surfaces.
4. Verified trainer blocked from admin surfaces.
5. Verified API role checks.

## Expected Result
Protected pages redirect unauthenticated users and role-scoped APIs reject cross-role access.

## Actual Result
27/27 role-boundary tests passed.

## Pass/Fail
Pass.

## Blocker Status
None for tested role boundaries.

## Fix Status
Reduced admin users API response to avoid exposing credential/token fields to the admin browser.

## Retest Proof
Live role-boundary suite passed. Local `npm run check` passed after admin API fix.
