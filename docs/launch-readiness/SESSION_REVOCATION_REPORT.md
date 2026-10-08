# Session Revocation Audit

- Date/time: 2026-10-08 UTC; database tests at approximately 07:08, final verification below.
- Source baseline: `6ba2929e0432faca904dbdfdbdaa439f896104fe` plus the commit containing this report.
- Environment: isolated Windows checkout, Node 22, Next.js production build, disposable PostgreSQL on loopback port 55439. Browser target is `http://127.0.0.1:3107`.
- Accounts: random synthetic `example.test` parents, trainers and administrators. No real account changes, payment, payout or production migration.
- Status: local security fix verified; production rollout and full product/money-flow signoff remain on hold.

## Findings And Fixes

High: signed JWT role/profile claims were trusted for up to 30 days without verifying the current account. Password reset and self-deletion did not revoke existing cookies; demotion could leave an old administrator cookie privileged. Self-deletion retains an anonymized user row, so checking only that a user exists is insufficient.

Added `User.sessionVersion`, default zero, with a nonnegative database constraint. Credential login stamps the version. API authentication and NextAuth's server/client session callback now load the current database identity and require exact role/version agreement. Missing users, legacy cookies without a version, mismatched roles and database lookup errors fail closed. Public session responses do not expose the version or password hash. Profile identity follows the current role, not whichever profile happens to exist first.

Successful password resets atomically consume the unexpired token and increment the version. Concurrent reset attempts cannot both change the password. Self-deletion and administrator role changes also increment it. Edge middleware rejects missing/malformed version claims but does not query the database; protected server layouts and API handlers perform the fresh check. Requests already authorized before a concurrent revocation are not globally cancelled by this change.

The legacy `/api/admin?view=users` response selected whole users, including credential/token fields. Replaced it with an explicit projection. Corrected NextAuth's type declarations to augment the real module instead of shadowing JWT exports.

## Migration And Rollout

`prisma/migrations/20261008070000_add_session_version/migration.sql` was applied only to the disposable database, after checking database/role and its explicit test marker. Both ALTER TABLE statements succeeded. Existing synthetic users receive version zero. Full production migration history/drift and rollout remain unverified.

Before deployment: review migration drift, take an approved backup, rehearse against isolated staging, apply the additive column/constraint before deploying code, then verify credential login and revocation against the intended deployment. Do not deploy this code against a database without the column: authentication intentionally fails closed. This release forces all pre-version cookies to sign in again. It does not revoke the old production application's cookies until the new server code is actually deployed. Rolling back to old authentication code can restore stale-token acceptance; keep revocation protection during rollback. Never lower a user's version to restore access.

## Exact Test Steps And Results

1. Set `TEST_DATABASE_URL` to the guarded disposable database and `TRAINR_ALLOW_DB_TESTS=1`; run `npm run test:postgres`. Expected: actual SQL persistence and revocation without touching external databases. Actual: **50/50 PASS across 2 files in 9.61 seconds**. Forty existing money-flow tests use simulated Stripe/auth; ten new session tests use actual encrypted NextAuth cookies, real Prisma queries and real handlers. Only rate limiting is mocked in that new file to isolate concurrency behavior.
2. Create a synthetic parent, encode the signed current version, call `getRequestUser` and `GET /api/bookings`; expected/actual fresh identity and HTTP 200. Repeat with missing version, wrong role, deleted user, role changed and changed back; expected/actual null identity or HTTP 401. Attempt a negative version; PostgreSQL rejects it and preserves zero. **PASS**.
3. Set a synthetic reset token/expiry, invoke `POST /api/auth/reset-password`, read the row independently, retry/reset concurrently and exercise the actual credentials provider. Expected/actual version advances once, token clears, old password/cookie fails, new password/cookie succeeds; concurrent statuses `[200,400]`, expired/reused token 400. **PASS**.
4. Invoke actual `DELETE /api/account`, verify retained anonymized row/version one and old-cookie `GET /api/bookings` 401. Admin self-deletion remains 403 with version unchanged. **PASS**.
5. Run `npx vitest run tests/middleware-session.test.ts tests/session-revocation.test.ts tests/auth-boundary.test.ts`. Expected/actual missing/malformed/legacy claims denied, both cookie names supported, fresh role-specific projection, database failure closed and client JWT updates unable to advance the version. **37/37 PASS**.

Initial full check exposed the pre-existing JWT module-shadowing declaration; corrected it and reran. The first full suite passed 547 tests before eight dedicated middleware regressions were added. Final exact-tree quality gate and browser results are recorded below after execution, not inferred from those earlier results.

## Browser And Final Retest

Final `npm run check` exited zero: lint with existing warnings, typecheck, **555 unit tests / 31 files**, Prisma generation and production build with 68 generated pages. Focused middleware/auth tests passed 37/37. The initial typecheck failure was corrected before this final run.

Initial real-auth browser run: 4/5 passed; desktop sign-in failed because the header and form both matched the button selector. Scoped the locator to the form without weakening application assertions. Final full browser run: **29/29 PASS in 2.1 minutes**, completed approximately 07:17 UTC. Exact command:

```text
npx playwright test e2e/session-local-regression.spec.ts e2e/trainer-approval-local-regression.spec.ts e2e/public-trainer-local-regression.spec.ts e2e/catalog-local-regression.spec.ts e2e/certifications-local-regression.spec.ts e2e/fee-settings-local-regression.spec.ts e2e/booking-local-regression.spec.ts e2e/trainer-profile-local-regression.spec.ts --project=chromium --workers=1
```

Environment: `BASE_URL=http://127.0.0.1:3107`, `LOCAL_E2E_CHANNEL=msedge`, an explicit local-only `LOCAL_E2E_SECRET` matching the built server, and the guarded test database settings above. The new five-case browser suite has no API mocks. At 1440px and 390px: sign in through `/auth/signin`, verify `/parent/dashboard`, `/api/auth/session` and `/api/bookings`, reset via the real endpoint, verify old-cookie API 401 and page redirect, then sign in with the new password and verify 200. **PASS at both widths**.

With two synthetic administrators, verify current access and safe `/api/admin?view=users` projection; demote the second through real `PATCH /api/admin/users`, read version one, restore its old cookie, expect `/api/admin/users` 401 and `/admin` redirect. **PASS**. Real `DELETE /api/account` revokes retained-row parent access; a legacy versionless cookie is denied by API and middleware. **PASS**. Existing 24 browser regressions now use real synthetic database users for server authentication, while retaining their explicitly mocked business APIs. Neither class establishes live Stripe or production behavior.

Independent cleanup readback at `2026-10-08T07:16:57Z`: users 0, admin_actions 0, notifications 0, bookings 0. Built server and disposable PostgreSQL were stopped. Expected SQL constraint failures are intentional negative-test evidence, not leaked production data.

Read-only live smoke at `2026-10-08T07:14:44.8346382Z`: `/api/health` HTTP 200, `ok=true`, `dbConnected=true`. At `07:14:45.0944878Z`, anonymous `/api/bookings` returned 401. **PASS only for connectivity and anonymous rejection on the older production code**, not deployment of this session patch. No production sign-in or mutation was attempted.

Refetched main remains `2067e743c54ffee669cd484f26dc472b157f1881`. Baseline GitHub run `37740256248`, job `113189076347`, executed no steps: "The job was not started because your account is locked due to a billing issue." Local check success does not replace that missing remote run. Publication is to the existing audit branch, not a production promotion.

## Remaining Blockers

- No production migration, sign-in/reset/revocation mutation or end-to-end paid booking/payout proof in this pass.
- Admin role-change audit writes are not yet atomic with the mutation; last-admin demotion/deletion races and role-profile lifecycle still require separate fixes.
- Registration, verification email delivery and the wider account/child workflows are not signed off by these tests.
- Previously disclosed privileged demo credentials still require owner rotation/disablement and verified production session revocation.
- GitHub Actions billing lock, correct `trainr-node` production deployment, Stripe/Connect financial evidence, cancellation/refunds and remaining product gates stay open.

The baseline audit commit now has a successful Vercel preview status. That is not the production-domain deployment or proof of this new migration.
