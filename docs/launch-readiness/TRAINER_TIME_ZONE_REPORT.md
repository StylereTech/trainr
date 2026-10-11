# Trainer Schedule Time Zone Capture

## Scope And Environment

- Date: 2026-10-11, work began approximately 07:35 UTC.
- Baseline: `baff8faff81a091693b18aef915908124b065678`; current changes initially uncommitted. Publication identity and hosted retest are recorded below when verified.
- Branch: `codex/payment-readiness-20261006`; Vercel audit Preview project `trainr` only. No main merge, Production (`trainr-node`), Story, Resend or live Stripe change.
- Local: Windows, Node, PostgreSQL 16.15 on `127.0.0.1:55439`; guarded disposable test databases, synthetic `@example.test` TRAINER/PARENT accounts. No hosted session injection or real credentials.
- Browser target: local optimized Next.js server at `http://127.0.0.1:3107`, Chrome, 1440x900 and 390x900, browser zone Pacific/Honolulu. Existing hosted parent remains signed in separately.
- Routes: GET/PUT `/api/trainer/onboarding`, `/trainer/onboarding`, `/trainer/profile?tab=availability`; related catalog, service and certification regressions.

## Finding And Fix

**FAIL / high release risk:** trainer profiles had no stored schedule time zone. Availability and bookings still store clock strings and civil dates, so the system cannot reliably determine a session's actual instant or reject a session that has already started in the trainer's zone.

This change implements **capture only**, not the complete scheduling fix:

1. Add nullable `TrainerProfile.timeZone` through additive migration `20261011080000_add_trainer_time_zone`. Existing trainers remain NULL; no browser, server, address or Texas default is assigned.
2. Onboarding and profile editing require an explicit named IANA zone or UTC. API validation rejects missing/invalid values, abbreviations and bare offsets; Intl canonicalizes accepted aliases.
3. Save the choice inside the existing revision-checked profile transaction. GET returns an empty selection for unknown legacy rows. Stale saves fail; later SQL failure rolls back the zone and other profile writes together.
4. Add a labeled native select with stable initial options, then browser-supported choices after hydration. Fix onboarding time-input labels and narrow-screen sizing; review displays the selected zone.
5. Permit only the specifically reviewed additive migration on the already-owned audit Preview database, after exact existing-ledger prefix/checksum verification. Recheck the complete ledger after deployment. Unknown/modified/unapproved history remains blocked; Production builds without the opt-in do not run this initializer.

## Test Steps And Evidence

| Test | Expected | Actual / Status |
| --- | --- | --- |
| Focused unit suite: `node node_modules/vitest/vitest.mjs run tests/time-zone.test.ts tests/trainer-profile-save.test.ts tests/staging-initializer.test.ts` | Named zones accepted/canonicalized; invalid and stale input rejected; atomic rollback; guarded upgrade only | 118/118 passed, 3 files, 07:41 UTC |
| `node node_modules/tsx/dist/cli.mjs scripts/test-migrations.ts --integration` with guarded local TEST_DATABASE_URL and TRAINR_ALLOW_DB_TESTS=1 | Fresh, legacy and recorded-phone-history schemas reach parity; 12 migration checksums match; replay no-op; legacy rows unchanged and zone NULL | PASS, exit 0; all three owned rehearsal databases removed |
| SQL suite run by rehearsal on fresh migration-created schema | Real handler saves/readbacks, invalid/stale denial, rollback and unchanged historical booking rows | 318/318 passed, 11 files, 59.73s; simulated Stripe receipts are not provider proof |
| Full `npm run check` | Lint/type/unit/build success | Final rerun PASS, exit 0: 1,091 tests / 53 files, optimized 73-page build; existing lint and Browserslist warnings remain |
| Browser profile/onboarding at both widths | No inferred Honolulu zone; require choice; save Chicago; refresh/read SQL; edit UTC; refresh without moving weekly clock strings | Final 12/12 PASS in 2.0m, exit 0, no skips/retries/deadline increases; includes contrast assertions |
| Hosted Preview deployment and smoke | Ready exact source, guarded migration, retained parent access | Pending |

SQL scenario explicitly reserves a synthetic booking, snapshots its complete row, selects `US/Eastern`, reads canonical `America/New_York` through an independent database client and GET, rejects the old-revision UTC edit, and compares the entire booking row unchanged. The injected later availability SQL failure also verifies timeZone remains NULL. Neither test establishes real session instants.

## Failures And Recovery

- Initial restricted-process Vitest could not read configuration; initial restricted PostgreSQL startup could not create its Windows token. Re-ran with approved local-process escalation; focused tests passed and loopback server started.
- Initial full gate reached 1,091 passing tests, then Prisma generation failed with `EPERM ... query_engine-windows.dll.node` while the SQL rehearsal still held the engine. The rehearsal completed and released it; reran the entire gate, not just skipped generation.
- Older local browser DB `trainr_audit_20261008` has no `_prisma_migrations` ledger. `migrate deploy` correctly refused with P3005. Verified its disposable marker and zero users/bookings/payments; did not fabricate a ledger or force migration. Created separate `trainr_audit_timezone_20261011`, applied all 12 committed migrations successfully, and installed the disposable-test guard.
- First browser run passed all 12 cases, but manual screenshot review found poor selected-day text contrast and dark native clock icons on dark fields. Corrected active-day text to dark green and set dark color-scheme on schedule time inputs in both trainer screens; added computed-style assertions. [Pre-correction screenshot](evidence/time-zone-20261011/onboarding-contrast-before.png). Re-ran the full check successfully and all 12 browser cases against the rebuilt application.

## Final Local Retest

Completed by 2026-10-11 07:56 UTC. Command: `node node_modules/@playwright/test/cli.js test e2e/time-zone-local-regression.spec.ts e2e/trainer-profile-local-regression.spec.ts e2e/certifications-local-regression.spec.ts e2e/catalog-local-regression.spec.ts --project=chromium --workers=1 --reporter=list --output=test-results/time-zone-final`, with loopback BASE_URL, matching synthetic LOCAL_E2E_SECRET, LOCAL_E2E_CHANNEL=chrome, guarded local TEST_DATABASE_URL and TRAINR_ALLOW_DB_TESTS=1.

Four new onboarding/profile cases used actual HTTP handlers and PostgreSQL persistence, with local synthetic authentication cookies only. Eight adjacent catalog/profile/certification cases use mocked API payloads and are not SQL/provider proof. Browser role is TRAINER, browser zone Honolulu; no zone is inferred. Both entries require a choice, save Chicago, read it after navigation, change to UTC, reload, and independently query the database. Monday remains 09:00-17:00. Native field labels, input color-scheme, active-day text color and viewport bounds are asserted.

Inspected retained [desktop onboarding](evidence/time-zone-20261011/onboarding-desktop.png), [mobile onboarding](evidence/time-zone-20261011/onboarding-mobile.png) and [mobile profile readback](evidence/time-zone-20261011/profile-mobile-readback.png). Zone/time controls fit without page overflow. The profile's existing tab strip is internally horizontally scrollable; this is not a claim that every screen is visually audited.

Read-only psql after the final run confirmed the disposable marker and users=0, bookings=0, payments=0, sports=0. Local application and PostgreSQL processes stopped. Applied new migration checksum: `0a03cc4b6d9c6d011f0dbc556263b2a7a90e12ba8ef09255a627f5db2ade70b1` (finished). No hosted user was created or altered.

## Remaining Release Gates

**Overall HOLD.** Capture does not resolve immutable per-booking zone/instants, nonexistent or repeated daylight-saving times, past-start reservation/checkout rejection, cross-zone athlete overlap, hold expiry, rescheduling or existing-booking migration policy. Those require subsequent implementation and tests before production. Do not infer UTC instants from legacy unknown zones.

Actual hosted trainer signup/profile/Connect, approved bookable services, provider-created sandbox Checkout/payment/transfer/payout, full program purchase/entitlement flows and Production rollout remain incomplete. The existing hosted parent has one synthetic athlete and no bookings; email setup remains owner-deferred. No feature is promoted to passed merely because this foundation passed locally.

## Publication And Hosted Retest

Pending local browser verification and publication. Do not interpret this report as production or money-flow signoff.
