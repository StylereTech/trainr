# Staging Catalog Validation

- Recorded: 2026-10-10 23:52 UTC (America/Los_Angeles afternoon).
- Baseline SHA: `1bde7a3767f35e42aff8222da8888eb9b3106726`.
- Verified SQL/test source SHA: `2981acfa35a82a02b35efd76b2f0c40eff67a48a`.
- Environment: isolated Neon `trainr-audit-staging-20261009`, project `steep-field-81581985`, connected to Vercel project `trainr` Preview only. Local Windows unit-test environment for regression tests.
- Account used: authenticated Vercel `styleretech` in `styleres-projects`. No parent, trainer, admin or Stripe account was created or used for an application transaction in this pass.
- Overall result: reference-data setup **PASS**; actual parent/trainer Stripe flows and production signoff remain **HOLD**.
- Previous goal turn classification: **progress** (provisioned/migrated Preview and published verified code). This pass makes additional staging-data and test-reliability progress; it is not a claim that pending owner actions happened.

## Failure And Scope

Fresh read-only SQL confirmed the new database still had zero sports, users, bookings and payments. Source inspection of `/api/trainer/onboarding` shows onboarding requires at least one sport and specialty, resolves them against the database catalog, and returns the catalog from the GET handler. An empty catalog therefore prevents valid trainer setup. This is a setup prerequisite failure established from SQL and code, not an authenticated browser test.

The existing `prisma/seed.ts` deletes application records and creates fixed-password demo accounts. It was not executed. `scripts/staging-reference-data.sql` instead adds the existing five-sport, 32-specialty catalog only. It does not create users, trainer profiles, approvals, services, credentials, fees, bookings or financial records.

The SQL runs as one atomic PostgreSQL DO statement, verifies database/user identity, the exact ownership marker and completed migration count, and takes the same transaction advisory lock as the guarded initializer. Existing sports/specialties are preserved with `ON CONFLICT ... DO NOTHING`; there are no UPDATE or DELETE statements. It is an operator artifact, not an automatic production seed or new deployment hook.

## Database Tests

Route used for every SQL step:

`https://vercel.com/styleres-projects/~/integrations/neon/icfg_mEwoLqA9nauJcFbjccmZ56U9/resources/storage/store_XfqL8TP23Pm8rabk/query`

| Exact steps | Expected result | Actual result | Status |
| --- | --- | --- | --- |
| Rerun database/account/booking/payment/sport counts in read-only mode | Revalidate target and starting state | `neondb`; users/bookings/payments/sports all 0; 1715 ms | PASS |
| Execute SQL body with only resource marker changed to `trainr-audit-NOT-APPROVED` | Reject before writes | `STAGING_OWNERSHIP_REQUIRED`; 800 ms | PASS: negative guard |
| Read sports, specialties, users, bookings and payments after rejection | No records written | All five counts 0; 1106 ms | PASS |
| Execute exact approved SQL body with correct resource marker | Populate existing reference catalog only | DO statement succeeded; 851 ms | PASS; counts independently checked next |
| Read all five counts and sorted-row catalog fingerprints | 5 sports, 32 specialties, no accounts or financial records | 5 / 32 / 0 / 0 / 0; fingerprints below; 804 ms | PASS |
| Replay the identical initializer | No duplicate entries or replacement of existing contents | DO statement succeeded; 983 ms | PASS; independently checked next |
| Restore read-only mode; rerun proof query | Identical counts and contents | Exact same counts and both fingerprints; 929 ms; read-only checkbox checked | PASS: replay proof |
| Read active sports with joined specialty counts | All five sports active with complete associations | Football 8; baseball, basketball, soccer and track-field 6 each; all active; 1529 ms | PASS |

The UI reports `0 rows changed` for the DO command tag even when its internal INSERTs create rows. That tag was not treated as insertion evidence; independent SELECT results establish the result.

Both before and after replay:

```json
{
  "sports": 5,
  "specialties": 32,
  "users": 0,
  "bookings": 0,
  "payments": 0,
  "sports_digest": "c10665f04b5d1353ad538af2a494053c",
  "specialties_digest": "7900749967ae00ddabfc6f60ec6a1f93"
}
```

Fingerprints use PostgreSQL `md5(string_agg(row_to_json(row)::text, '|' ORDER BY id))` as a repeatability comparison, not as a security primitive. Wrong-database, busy-lock and failed-migration guard branches were reviewed but were not separately exercised against Neon; do not count them as passing runtime tests.

## Regression And Retest

Initial focused run of trainer-catalog, workflows and athlete-validation suites: 39 passed, 1 failed. The first parent workflow exceeded its 5000 ms test timeout; that deadline included a cold dynamic import of the Next.js route. The same first-test timeout had occurred during the previous provisioning turn. Setup overhead is the working explanation, not a measured production request latency.

`tests/workflows.test.ts` now imports the route in `beforeAll` setup instead of inside each request test. All behavioral assertions, mocks, request bodies, expected statuses and the existing request-test timeout remain unchanged. Import failure still fails setup and the suite.

Focused retest: **40/40 passed** in 3 files (7.98 s overall). Full quality-gate results and publication are recorded below. No new authenticated browser E2E or provider-backed Stripe transaction is implied by these unit tests or SQL tests.

### Full Gate And Source Publication

2026-10-11 00:03 UTC: `npm run check` completed with exit 0: lint (pre-existing warnings), typecheck, **981/981 tests in 48 files**, Prisma generation and Next production build with **73/73** static pages. All four workflow tests passed in the full run. No request-test timeout was increased.

Source commit `2981acfa35a82a02b35efd76b2f0c40eff67a48a` was pushed successfully to `codex/payment-readiness-20261006`. Remote references were refreshed first, with no remote changes requiring a merge. Main and production were not promoted. The SQL artifact is not a build hook and will not create or alter data merely because this commit is deployed.

2026-10-11 00:04 UTC: exact-source Vercel Preview `DqTChAwxkjoD25J1ubyaub8oWP5E` (`trainr-fzrec94pk-styleres-projects.vercel.app`) is **Ready**. The build log confirms `Audit staging schema verified; migration checksums verified.` Post-deployment read-only SQL (891 ms) returned the same 5/32/0/0/0 counts and both unchanged catalog fingerprints. This verifies reference-data persistence through deployment, not authenticated application or money-flow persistence.

## Remaining Owner Gates

- Fresh Vercel settings inspection still shows Standard Protection / Require Log In with no domain exception. The precise audit-domain exception request remains unanswered; no protection setting was changed.
- The prepared Add Environment Variable dialog for the independent `NEXTAUTH_SECRET` remains open. Its value was not read or submitted. Owner credential entry/submission is still required.
- Controlled parent/trainer fixtures, authenticated registration/login, full sandbox Checkout, actual signed webhook delivery, trainer Connect onboarding and transfer/payout readiness remain unverified. Production database and live Stripe funds were untouched.
