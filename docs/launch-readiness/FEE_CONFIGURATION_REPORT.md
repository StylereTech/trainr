# Fee Configuration Integrity

- Date/time: 2026-10-08 05:12 UTC onward.
- Baseline SHA: `29d8ae449bf91ba98919dcdd4314a69f0391a050`; revised source is the commit containing this report.
- Environment: local Windows/Node 22, disposable PostgreSQL 16.15, synthetic accounts and provider responses. No production financial settings changed.
- Endpoints/surfaces: `GET/POST /api/admin/settings`, `GET/PUT /api/trainer/onboarding`, `POST /api/bookings`, checkout helper, `/admin/settings` and trainer pricing fields.
- Accounts: synthetic administrator JWT/route fixture, parent/trainer database fixtures at `example.test`; integration helper audit records use the synthetic trainer user's existing foreign key. ADMIN role enforcement is separately exercised at the HTTP handler boundary, not claimed by the database helper test.

## Finding And Fix

Settings previously accepted arbitrary JSON, deactivated old rows before creating a replacement, then wrote the audit separately. Bookings ignored the saved commission and always used 15%. The admin UI treated failed initial loads as an empty configuration and could overwrite settings from a stale page.

Updates now require ADMIN, complete validated values and an expected configuration ID (null only when none exists). A transaction-scoped PostgreSQL advisory lock serializes writers, including the first configuration. The old rows, new row and audit commit or roll back together. Stale revisions return 409. GET reads history/current identity consistently in a repeatable-read transaction; failures return 503 without private diagnostics. The UI has explicit load-error/retry and stale/reload states and retains the returned revision on save.

New bookings read the single valid effective active configuration. Missing configuration uses the existing 15% / $15 baseline, not an environment variable. Multiple effective active rows or invalid stored values fail closed for administrator review. Commission is applied to the discounted total, rounded to cents, and snapshotted into the booking. Checkout uses that existing split and never reprices a booking after a settings change. Stripe percentage/flat-fee fields remain planning estimates only, not additional charges or invented provider fees. Removed the unused `STRIPE_PLATFORM_FEE_PERCENT` entry from `.env.example`.

Minimum price applies to the service's pre-discount price, not the discounted charge. Validation retains the trainer editor's existing $15 lower bound and $100,000 upper bound. Admin may raise the minimum within those bounds. Both new reservations and trainer service saves enforce it; the trainer GET response exposes the current requirement to both price editors. Existing bookings are unaffected. Coupon totals continue to use the separate zero-or-valid-USD-charge rule. Existing active services below a newly raised minimum require trainer correction before another booking; do not silently raise their price.

## Executed Tests

1. Focused settings/booking/trainer tests: initially three table-driven fixture argument failures, corrected; **88/88 passed**. Tested access roles, missing authentication, invalid numeric/input/revision fields, default reads, stale writes, atomic audit failure, invalid/ambiguous configuration, configured discounted splits and trainer minimum validation.
2. PostgreSQL test matrix: **18/18 passed in 2.82 seconds** at 05:12 UTC. Created a 20% config, booked a $60 session, changed config to 10%, booked another session, then checked out the first. Expected/actual: old booking/payment/Stripe-request fee $12; new booking fee $6. Stripe itself remained mocked.
3. Actual simultaneous PostgreSQL config updates from the same null revision: expected/actual one winner, one active config and one audit row. This is real database locking, not the unit transaction model.
4. Forced actual audit foreign-key failure: expected/actual replacement rolled back, predecessor remained active, no second config persisted. Expected Prisma error output is not a suite failure.
5. Independent cleanup counts: zero users, bookings, payments, coupons, fee configs and admin audits; disposable server cleanly stopped.
6. Full gate unit result: **393 tests / 25 files passed**. Final build and desktop/mobile browser results are recorded in the audit checkpoint.
7. Full gate completed with exit 0, including production build. Local browser matrix ultimately **10/10 passed in 46.7 seconds** after narrowing an ambiguous test alert selector. The new two admin cases cover load-error retry, returned revision reuse, stale save rejection, reload recovery and horizontal containment at 1440px/390px. Screenshot inspection confirmed visible controls and fitting labels. Browser API/auth responses were synthetic, not live admin writes. Local fixture server stopped afterward.

## Release Limits

No new schema migration is required for this fee change. The earlier checkout-attempt migration still requires staging/production rollout. Before any promotion, review actual stored fee configurations and administrator authority, compare the intended commercial terms and trainer disclosures, and reconcile any historical payments charged with a different split. This patch does not retroactively modify them.

Still open: real Stripe test/live checkout, refunds/reversals, Connect/bank payouts, security credential remediation, remaining product/account/UI work, GitHub billing lock, correct-project production deployment and live signoff. The goal remains incomplete; main and production are on hold.
