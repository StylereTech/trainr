# Trainr E2E Browser Tests

## Setup (in Replit or local)

```bash
# Install Playwright
npm install

# Install browser (first time only)
npx playwright install chromium --with-deps

# Run all E2E tests
npx playwright test

# Run specific suite
npx playwright test e2e/parent-flow.spec.ts
npx playwright test e2e/trainer-flow.spec.ts
npx playwright test e2e/admin-flow.spec.ts
npx playwright test e2e/role-boundaries.spec.ts

# Run with UI (local only)
npx playwright test --ui

# View HTML report
npx playwright show-report e2e-report
```

## Configuration

- **Target**: Live Vercel deployment (`https://trainr-seven.vercel.app`) or override with `BASE_URL=http://localhost:5000`
- **Browser**: Chromium (system Chrome or Playwright-managed)
- **Workers**: 1 (sequential, avoids race conditions with shared test accounts)

## Test Accounts

| Role | Email | Password |
|------|-------|----------|
| Parent | jennifer.davis@email.com | Parent123! |
| Trainer | marcus.johnson@email.com | Trainer123! |
| Admin | admin@trainr.app | Admin123! |

## Test Suites

### parent-flow.spec.ts (11 tests)
Login, browse trainers, search, view profile, booking page, dashboard bookings, athlete management, review flow, messages

### trainer-flow.spec.ts (10 tests + 1 skipped)
Login, dashboard, onboarding, profile, bookings, wallet, Stripe Connect (SKIPPED — external provider blocker)

### admin-flow.spec.ts (15 tests)
Login, dashboard, users, bookings, trainers, analytics, payouts, disputes, coupons, settings — with API validation

### role-boundaries.spec.ts (35 tests)
- Parent blocked from 3 trainer routes + 4 trainer APIs
- Trainer blocked from 9 admin routes + 8 admin APIs
- Unauthenticated users redirected from 8 protected routes
- API role enforcement (cross-role POST attempts)

## Known Blockers

- **Stripe Connect** (`trainer can initiate Stripe Connect`): Skipped — requires real Stripe Connect onboarding flow with provider setup
- **Memory constraint**: Tests require ~500MB RAM for Chrome headless. This WSL sandbox has 3.6GB but Chrome gets OOM-killed. Run in Replit or CI.
