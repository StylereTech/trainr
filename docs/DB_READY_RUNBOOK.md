# Trainr DB-Ready Runbook

This project is ready for DB hookup, but **runtime verification is blocked until `DATABASE_URL` points to a reachable PostgreSQL database**.

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

## 3) Commands to run as soon as DATABASE_URL exists

Run from project root:

```bash
cd /home/jeane/.openclaw/workspace/trainr
cp .env.example .env   # if .env does not already exist
# then edit .env and set DATABASE_URL to the real reachable Postgres URL
npm run db:check
npx prisma validate
npm run db:push
npm run db:seed
npm run build
npm test -- --run
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

### Apply schema
```bash
npm run db:push
```

### Seed realistic data
```bash
npm run db:seed
```

## 6) What "DB-ready" means now

Current repo state is ready for immediate DB hookup because:
- Prisma schema validates
- seed script is schema-aligned and transpiles
- build passes
- typecheck passes
- tests pass
- route protection is in place
- a DB reachability check script now exists

## 7) The only real blocker

**A reachable PostgreSQL `DATABASE_URL`.**

Until that exists, no honest score increase is possible for DB/runtime-sensitive categories like:
- auth/account runtime
- backend reliability
- API integrity
- trainer/profile persistence
- booking persistence
- admin runtime
- production readiness
