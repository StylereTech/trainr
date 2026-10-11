# Trainer Package Management

## Identity And Scope

- Date: 2026-10-11 UTC; implementation and verification after 11:12 UTC.
- Baseline: `c22688a75140890df623851a67eebdecdc857da1`, branch `codex/payment-readiness-20261006`; initially clean worktree.
- Target: isolated audit Preview project `trainr`, existing branch alias only. Main, Production `trainr-node`, Story, email/Replit, provider credentials and database schema are unchanged.
- Local environment: Windows, optimized Next build, Chrome at 1440px and 390px; disposable PostgreSQL 16.15 `trainr_audit_timezone_20261011` on loopback 55439, synthetic `@example.test` users. No provider charge, transfer or payout is part of this pass.
- Routes: `/trainer/packages`, `/api/trainer/packages` GET/PUT, `/trainer/dashboard`, `/trainer/profile?tab=services`, `/trainers/[slug]`, `/api/trainers/[slug]`, existing profile-save API and role redirects.
- Overall: catalog management implementation, **NOT package purchase or money-flow signoff**. Parent package checkout, purchased entitlement/payment identity, redemption, balance/history, refund/expiry/credit ownership policy and actual Stripe proof remain incomplete/HOLD.

## Finding And Repair

Existing Package/PackageItem storage and public listings had no trainer management route. Actual anonymous GET to the hosted audit alias `/api/trainer/packages` at 11:22:57.589 UTC returned 404 HTML before publication. The missing management finding is superseded by this implementation, not by a claim that single-session booking sells a package.

Trainer-only management now supports inactive creation, editing, duplication, activation/deactivation and paginated persisted readback (20 rows/page). Owned active services and coached active sports are required. Counts are derived, USD cents must be integers, repeated services are rejected. Technical resource bounds are 50 items, 1,000 total sessions, 50..99,999,999 cents and 1..3,650 validity days. Stored validity is catalog metadata, not an implemented expiry policy.

User then trainer locks serialize writes with account closure and profile/service changes. Current role/deletion and exact revision are checked after locks. A new client UUID provides durable creation identity; identical inactive creation replay returns the saved record, while changed replay cannot overwrite it. Existing IDs remain editable. Referenced booking terms cannot be rewritten; trainers can archive or duplicate instead. Item replacement is atomic. Private no-store responses and generic unexpected-error handling prevent shared-cache disclosure or raw internal errors.

The UI validates response shapes, bounds network requests, disables repeat writes after unknown/conflicting results, and offers persisted-state reload. New packages start inactive. Empty, unavailable-service, list failure, save uncertainty and stale-edit states are explicit. Public listings state `Package checkout unavailable`; no unsupported purchase action was added.

An additional real-SQL reproduction showed that editing/removing a package-linked service left its package active: two expected-false assertions failed. Profile service retirement now atomically deactivates affected own active packages and advances their revisions, preserving old items/terms. A later failure rolls back both service and listing changes. No migration or dependency change was needed.

## Verification Ledger

| Steps / expected result | Actual result | Status / evidence |
| --- | --- | --- |
| Contract, route, role and existing profile unit tests | 107 passed / 3 files | PASS; `.postgres-test/package-management-unit-retest.log` |
| Create/edit/activate/replay with real SQL; reject foreign/inactive services, invalid terms, stale revisions and revoked roles; preserve booked terms and rollback | 19 passed | PASS; `.postgres-test/package-management-sql-retest.log` |
| Reproduce service edit/removal leaving an active package | 2 failed, 15 skipped before fix | Proven defect; `.postgres-test/package-service-retirement-baseline.log`; fixed and retested above |
| Full SQL suite after final source fix | 392 passed / 12 files, 60.42s, exit 0 | PASS; `.postgres-test/package-management-sql-final.log` |
| Full lint/type/unit/build gate after final source fix | 1,273 units / 59 files, 76-page build, exit 0; existing lint warnings | PASS; `.postgres-test/package-management-check-release.log` |
| Desktop/mobile browser lifecycle, failures and role boundaries; existing public/profile regression | 40 passed / 4 files, 5.3m, exit 0 | PASS; `.postgres-test/package-browser-full.log` and `.postgres-test/package-browser-full-results/` |
| Hosted trainer CRUD and Stripe payment/payout | Not performed | NOT VERIFIED; separate trainer prerequisites still required |

Initial full quality gate `.postgres-test/package-management-check.log` failed during Prisma generation with Windows EPERM renaming `query_engine-windows.dll.node`; concurrent SQL tests held that DLL. Unit/static phases had passed. The SQL process was allowed to finish, and subsequent builds ran sequentially. Interim gate `.postgres-test/package-management-check-final.log` passed before the service-retirement fix; only the later release log above is the final-source gate.

Initial browser run had 10 passes and two failures from a test-locator ambiguity: an unscoped alert query matched the package failure and Next's route announcer. The assertion is now scoped by the expected package error text, with expected error/recovery/permission behavior unchanged. Focused rerun passed both cases in 12.4s (`.postgres-test/package-browser-retest.log`); the full affected rerun passed all 40. Final typecheck also exited 0 after this test-only correction.

Browser steps at both widths: sign into a synthetic trainer; follow dashboard Packages; create an inactive five-session $250 package; edit to four sessions/$220.50; activate and check actual public API/listing; duplicate; deactivate; reload and independently read both SQL records. Expected/actual: one durable identity per creation, saved edits, inactive listings absent from public response, zero payments. Separate tests send a real write then lose its response, return malformed success, introduce a conflicting revision, fail list loading and reload, deny real parent GET/PUT with 403 and redirect its page request, and disable creation without an active service. Fault responses are deliberately intercepted; happy-path writes and persistence are real local HTTP/PostgreSQL. Existing public-profile tests include simulated API errors; none is claimed as actual Stripe verification.

Final screenshots inspected at both widths: [desktop editor](evidence/package-management-20261011/desktop-editor.png), [mobile editor](evidence/package-management-20261011/mobile-editor.png), [desktop list](evidence/package-management-20261011/desktop-list.png), [mobile list](evidence/package-management-20261011/mobile-list.png). Labels, service select, stepper, price, action controls and list fit without overlap; explicit overflow assertions passed.

Independent psql cleanup verification matched `trainr_audit_timezone_20261011`, `trainr_test`, and the disposable integration guard. Users, bookings, payments, packages, package_items, sports and service_offerings all had count 0; injected `package_test_failure` constraint count 0. Owned Next and PostgreSQL processes were stopped after testing. No hosted data was deleted.

## Publication And Hosted Retest

Pending this pass's scoped commit/push, exact-source Ready deployment, alias check and hosted smoke. No new live success is claimed here yet. Existing owner PARENT session remains preserved; fresh observation during this pass shows one Sandbox Athlete and zero bookings. No password was collected or trainer created implicitly.

## Remaining Gates

Package purchasing is still missing. Do not charge an unrelated single booking or label it package-paid. Owner input about credit ownership and unpaid reservation expiry remains unresolved; no business policy was invented. Hosted trainer signup/approval, Connect onboarding, actual sandbox paid booking with destination receipt and payout proof, production migration/backup review and other release gates remain **HOLD**. Local synthetic SQL/browser success does not substitute for these checks.
