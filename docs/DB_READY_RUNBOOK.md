# Trainr DB-Ready Runbook

**Not a production-readiness signoff.** Database connectivity is only one prerequisite. Use [Current Launch Gates](launch-readiness/CURRENT_LAUNCH_GATES.md) and its dated evidence for authentication, booking, Stripe, security and release status.

**Do not run `npm run db:seed` against Preview, Production or any database containing records that must be retained.** The guarded legacy demo seed still performs unfiltered deletions and installs fixed-password demo users after its disposable-local checks pass. It is not an additive account-provisioning command. Supplying its documented credentials does not create those accounts in another database.

## 1) Exact DB requirements

- **Database type:** PostgreSQL
- **Primary env var:** `DATABASE_URL`
- **Expected Prisma provider:** `postgresql`
- **Schema expectation:** Prisma uses the `public` schema by default in `.env.example`
- **SSL expectation:**
  - **Local DB:** SSL usually **not required**
  - **Managed/remote DB:** may require `?sslmode=require` (or provider-equivalent) in `DATABASE_URL`

### Example local URL
```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/trainr?schema=public"
```

### Example remote URL pattern
```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DBNAME?schema=public&sslmode=require"
```

## 2) Minimal env contract for DB-backed runtime

Required to start real persisted runtime verification:

```bash
DATABASE_URL=...
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Useful / optional for deeper runtime:

```bash
STRIPE_PUBLIC_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLIC_KEY=pk_test_...
RESEND_API_KEY=...
EMAIL_FROM=...
```

## 3) Verify The Target Before Any Writes

From the intended checkout, identify the environment, database owner, host and database name without publishing connection credentials. Confirm the target is authorized and take a restorable backup before an approved schema change. Do not copy Production credentials into a test environment.

Read-only checks:

```bash
npm run db:check
npx prisma validate
npx prisma migrate status
```

Use reviewed, versioned migrations for an authorized deployment, not `prisma db push` as an operational shortcut. The isolated audit Preview has its own guarded initialization path in `scripts/prepare-staging.mjs`; do not copy its ownership marker or opt-in settings to another database. See [Staging Provisioning](launch-readiness/STAGING_PROVISIONING_REPORT.md).

After environment and schema verification, run local quality checks with an appropriate isolated test configuration:

```bash
npm run build
npm test
npm run dev
```

If you prefer prod-like local runtime:

```bash
npm run build
PORT=3000 npm run start
```

## 4) First runtime verification sequence

Once the app is up with a real DB, verify in this order:

1. **Signup**
   - `POST /api/auth/register`
   - confirm user row exists in DB
2. **Login**
   - sign in through `/auth/signin`
3. **Logout**
   - verify session clears
4. **Session persistence**
   - refresh protected routes and confirm session survives correctly
5. **Parent athlete creation**
   - create athlete from `/parent/athletes/new`
   - verify DB row exists and UI reflects it
6. **Trainer onboarding**
   - complete `/trainer/onboarding`
   - verify specialties, pricing, availability persist
7. **Trainer profile fetch**
   - hit `/api/trainers/[slug]`
   - open `/trainer/[slug]`
8. **Booking persistence**
   - create booking from `/book/[slug]`
   - verify booking exists in DB
9. **Booking downstream visibility**
   - verify parent/trainer/admin surfaces show it
10. **Admin auth/data**
   - login as admin
   - verify `/admin` loads persisted counts/data
11. **Stripe runtime classification**
   - only classify VERIFIED/PARTIAL if test keys are present and booking/payment state can be persisted honestly

## 5) Fast diagnostic commands

### Check DB reachability quickly
```bash
npm run db:check
```

### Validate Prisma schema only
```bash
npx prisma validate
```

### Inspect migration state without applying changes

```bash
npx prisma migrate status
```

### Test data and accounts

Do not use the legacy demo seed to repair a missing account. Its destructive fixture behavior remains, but `scripts/seed-safety.ts` now rejects hosted/Production environments and verifies the explicitly opted-in disposable local target before invoking any seed write. The seed's compatibility with the current financial schema is not verified by this guard.

For an independently authorized, disposable local fixture database only, the guard requires all of the following:

- Exported `DATABASE_URL` using PostgreSQL on `127.0.0.1` or `localhost`, user `trainr_seed`, database `trainr_seed_<suffix>` and schema `public`. Only `schema`, `connection_limit`, `pool_timeout` and `connect_timeout` query parameters are accepted, with no duplicates or connection-routing overrides.
- `TRAINR_ALLOW_DESTRUCTIVE_SEED` exactly equal to that database's name; this explicitly acknowledges replacement of its records. A generic `1` is not accepted.
- No `VERCEL`, `VERCEL_ENV` or `TRAINR_STAGING_INIT` value, and no `NODE_ENV=production`.
- The connected database's actual name, current role and schema must match the expected target. `public.trainr_seed_guard` must already contain exactly one row whose `purpose` is `disposable local demo seed`.

The guard does not create the database, role, schema or ownership marker, and must not be disabled to make a hosted seed work. Never install this marker in Preview, Production or a database whose records must be retained. Seed failures exit nonzero with a sanitized error code. This command remains inappropriate for normal account provisioning; use a reviewed additive workflow instead.

Preview test-account creation must be separately authorized, additive and limited to the intended environment. Never change an existing user's role or password to manufacture a test login, and never mark synthetic financial records paid as a substitute for Stripe evidence. Do not publish credentials in reports or commits.

The audit Preview reference catalog uses the separately reviewed `scripts/staging-reference-data.sql`, not the demo seed. It does not provision users or payment data; see [Catalog Validation](launch-readiness/STAGING_CATALOG_VALIDATION_REPORT.md).

## 6) Evidence Required For Readiness

A connected database, a successful build or historical test results do not establish production readiness. Verify current-source parent/trainer login and persistence, role isolation, booking and package purchase, actual sandbox Checkout and signed webhooks, trainer Connect capabilities, destination transfer and payout state. Also resolve the current refund-policy/execution, dependency, reliability, CI and release gates. Do not carry forward historical pass claims without their environment, source SHA, date and test scope.

Main/Production release, domain changes, migrations, backup/restore and rollback require their own approved plan and verification. The isolated Preview is not the Production environment.
