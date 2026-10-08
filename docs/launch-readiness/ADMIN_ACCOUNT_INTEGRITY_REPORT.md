# Administrator Account Integrity

- Date/time: 2026-10-08 UTC, initial SQL run 07:27-07:28; initial browser review approximately 07:32. Final retest below.
- Source baseline: `fb5f2489645507eb86307070e254091343390d20` plus the commit containing this report.
- Environment: isolated Windows checkout, Node 22, built Next.js server on `http://127.0.0.1:3107`, guarded disposable PostgreSQL on loopback port 55439, installed Edge via Playwright.
- Accounts: randomly named synthetic `example.test` parent/trainer/administrator records only. No production account change or real Stripe money movement.
- Status: scoped account-integrity fix; full platform, migration and money-flow signoff remain on hold.

## Confirmed Findings

High: `/api/admin/users` changed a user's role/session version before inserting the audit record. An audit failure could leave an unaudited committed change. The last-administrator check was not serialized, so concurrent demotions could both pass. The delete branch bypassed this guard and attempted physical deletion before audit insertion; related historical records could instead cause a constraint error.

High: role changes did not create the corresponding profile, leaving the destination dashboard without its required parent/trainer identity. Moving away from a trainer role did not deactivate the bookable listing. Deleting accounts through the admin branch differed from existing self-service anonymization and session revocation.

Medium: the admin user page did not send reviewed revisions, could overwrite newer edits, did not handle rejected fetches reliably, and could show an empty result after a failed load. Mutation uncertainty allowed immediate retries. User-list pagination/filter inputs were unbounded/unvalidated. The page also contained design commentary instead of operational content.

## Fixes

All administrator-membership mutations take transaction advisory lock `(746726, 2)` before deterministically locking actor/target user rows. The transaction rechecks the actor's current active administrator status, target state and exact `updatedAt` revision. Role/profile/session-version changes and audit insertion commit together. Last-active-admin checks run while membership writers are serialized. Admin self-deactivation is rejected even when another admin exists. Same-role requests are no-ops, without extra audits or version increments. Ordinary direct SQL/seed scripts do not participate in this application lock and must not bypass these invariants operationally.

Role changes create a missing parent profile or a pending trainer profile. A new trainer requires supplied first/last names; no fake names, approval or Stripe readiness are invented. Existing profiles/history are retained. Moving away from TRAINER deactivates its listing; returning to TRAINER does not silently reactivate it. Approval/activation/featuring also reject profiles owned by deactivated or non-trainer accounts. Trainer-decision transactions now reject a deactivated administrator whose historical role is retained.

The administrative `delete` action now requires an explicit reason and performs transactional deactivation/anonymization, not physical deletion. It shares account-closure logic with self-service deletion, which now locks/rechecks the user before closing. `User.deletedAt` records deactivation, login/session resolution rejects it, and role edits cannot revive it. Credentials/reset/verification tokens are invalidated; session version increments. Trainer services, packages and availability are disabled. Booking, payment, Stripe identities and audit relationships remain intact. The audit action is `DEACTIVATE_USER` and records the reason without copying the former email.

**This is not cancellation, refund, payout closure, full data erasure or legal retention-policy signoff.** Existing paid bookings and issued Stripe checkout URLs still require the separate reconciliation/refund workflow. The shared closure retains historical data that existing behavior already retained, including athlete dates of birth and financial relations; retention and external uploaded-file removal need a separate review. Earlier anonymized rows are not blindly classified/backfilled based only on their email pattern.

GET user listing validates page/limit/role/search, caps limit at 100 and search at 200 characters, uses deterministic ordering and a repeatable-read list/count snapshot. Responses explicitly select safe fields. The page shows load errors with Retry, handles stale/uncertain writes by disabling mutations until reload, and sends revisions. It collects trainer names when needed, requires a deactivation reason, displays deactivated state, and states the financial-retention/non-refund consequences before confirmation. Superseded fetch responses cannot replace newer results.

## Migration

`20261008073000_add_account_deactivation/migration.sql` adds nullable `users.deletedAt`. Applied only to the disposable database after checking exact database/role and its test marker. The prior `sessionVersion` migration is also required. Prisma generation passed. Before any release, rehearse the migration history/drift on isolated staging and apply both additive migrations before this code. Old code does not enforce deactivation; do not use an old-code rollback as a revocation strategy. No production schema or records were changed.

## Exact Steps And Results

1. Run `npm run test:postgres` with `TEST_DATABASE_URL` set to the guarded loopback database and `TRAINR_ALLOW_DB_TESTS=1`. Initial **62/62 PASS across 3 files in 14.76 seconds**, including twelve new admin SQL tests. Subsequent actor-deactivation regression and final rerun are recorded below.
2. Create two synthetic administrators and a parent. Change role; read profile, session version, audit and response independently. Expected/actual: required profile exists, version increments, one audit, no password/version exposed. Missing trainer names rejects 400; provided names produce PENDING/unconnected trainer. Same-role no-op leaves no audit; stale revision rejects 409. **PASS**.
3. Race two edits of one revision, two administrators demoting themselves, and two administrators deactivating each other. Expected/actual: one winner, one rejected request; at least one active administrator remains. Last-admin removal, self-deactivation, revoked actors and missing targets reject. **PASS**.
4. Add a temporary PostgreSQL audit CHECK constraint scoped to the synthetic target; run role creation and deactivation. Expected/actual: audit failure rolls back email, role, profile creation, version and deactivation. Drop the constraint and retry; exactly one audit persists. **PASS**. The deliberate SQL errors contain synthetic data only.
5. Create a synthetic trainer, parent, athlete, service, booking and paid payment carrying `pi_synthetic_retained`. Deactivate trainer; read back booking/payment/provider identity and inactive service/profile. Expected/actual history retained, account marked closed, matching-version session and even subsequently assigned known password cannot authenticate; role changes and listing activation reject. **PASS**. Stripe itself was not called.
6. `npm run check`: initial **588 unit tests / 32 files**, lint/typecheck, Prisma generation and production build with 68 generated pages passed. Unit tests validate request/role boundaries, malformed/unknown fields, revisions/reasons, bounded filters and generic failure responses. Final post-follow-up results below.
7. Run `npx playwright test e2e/admin-users-local-regression.spec.ts --project=chromium --workers=1`, using explicit local-only secret and installed Edge. **4/4 PASS in 28.1 seconds**. At 1440px/390px, real `/admin/users` UI creates a trainer profile, detects a DB edit made after review, blocks mutation until reload, changes back, requires a deactivation reason, retains a closed user row and disables further edits. Real APIs/SQL are used for these two success cases. Two error cases mock only failed list/mutation HTTP responses, then recover to the real user list; no duplicate mutation is sent. Screenshots `account-deactivation.png` under ignored test-results were inspected at both widths; confirmation copy/controls fit and the horizontal-bounds assertion passed.

## Live Read And Publication

At `2026-10-08T07:33:03.3584867Z`, read-only production `/api/health` returned HTTP 200, `ok=true`, `dbConnected=true`. At `07:33:06.8076863Z`, anonymous `/api/admin/users` returned 401. **PASS for connectivity and anonymous rejection only**, on older production code. No authenticated production mutation was tested.

Main refetched as `2067e743c54ffee669cd484f26dc472b157f1881`. Baseline audit commit has [successful Vercel preview deployment](https://vercel.com/styleres-projects/trainr/Gcz5sCH2pAnDrhZtPbYJLVLceNSJ). Its GitHub Actions run `37742602376`, job `113196565393`, executed zero steps due to account billing lock. Correct `trainr-node` production rollout, privileged demo remediation, all remaining account/product work and live Stripe/Connect/refund/payout proof remain open.

## Final Retest

The follow-up found that trainer-decision transactions checked historical ADMIN role but also needed the new deactivation status. Added that check and explicit unit/SQL regression, then rebuilt and reran the entire local matrix.

- `npm run test:postgres -- --reporter=dot`: **63/63 PASS, 3 files, 14.27 seconds**. Includes thirteen real account-integrity cases plus all prior SQL regressions. A closed administrator is rejected inside the actual trainer-decision transaction with 403.
- Final `npm run check`: **PASS**, lint with existing warnings, typecheck, **589 unit tests / 32 files**, Prisma generation, production build with 68 generated pages. Source remained unchanged after this final build.
- Final browser command below: **33/33 PASS in 2.8 minutes** on the rebuilt local server. The earlier complete run also passed 33/33 in 2.7 minutes before the fresh-actor follow-up. New admin account tests have two fully real API/SQL workflows and two controlled HTTP error scenarios; existing business UI cases retain their documented mocks. No skipped case is counted as a pass.

```text
npx playwright test e2e/admin-users-local-regression.spec.ts e2e/session-local-regression.spec.ts e2e/trainer-approval-local-regression.spec.ts e2e/public-trainer-local-regression.spec.ts e2e/catalog-local-regression.spec.ts e2e/certifications-local-regression.spec.ts e2e/fee-settings-local-regression.spec.ts e2e/booking-local-regression.spec.ts e2e/trainer-profile-local-regression.spec.ts --project=chromium --workers=1
```

Browser environment: `BASE_URL=http://127.0.0.1:3107`, `LOCAL_E2E_CHANNEL=msedge`, explicit local-only secret matching the server, guarded `TEST_DATABASE_URL`, `TRAINR_ALLOW_DB_TESTS=1`. No real Stripe secret used. Independent final readback at `2026-10-08T07:41:34Z`: users 0, admin_actions 0, notifications 0, bookings 0, payments 0. App server and disposable database stopped. Reports updated for publication on the existing audit branch; no main merge or production promotion. No final production readiness claim.
