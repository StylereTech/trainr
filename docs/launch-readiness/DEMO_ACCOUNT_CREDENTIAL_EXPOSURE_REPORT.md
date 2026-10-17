# Demo Account Credential Exposure Report

**Observed:** 2026-10-17 23:37 UTC. **Environment:** public GitHub source and `https://trainr.cc`; local audit branch `codex/payment-readiness-20261006` at baseline `dcbabf698ce233c9926368713a2110bb39d12a8a`. **Status:** Production launch HOLD until the affected hosted accounts are rotated or disabled and the result is verified.

## Finding and Reproduction

The repository's E2E login helper, E2E README and destructive demo seed contained fixed passwords for the parent, trainer and admin demo accounts. The approved parent and trainer credentials had just succeeded at public `/auth/signin` in the read-only booking regression; both subsequent `GET /api/bookings?page=1&limit=10` calls returned 500. Earlier authenticated public smoke also succeeded for the admin account. The source exposure makes these hosted passwords unsuitable as secrets. This report does not repeat them. Removing current files cannot erase Git history or rotate a hosted account.

The affected test/configuration routes are `e2e/helpers.ts` (`loginAs`), `prisma/seed.ts` (`npm run db:seed`), and `E2E_README.md`. The seed is guarded for a disposable local database and was **not** run here. No Production account, database, or payment record was changed.

## Fix and Verification

The E2E helper now requires `TRAINR_TEST_<ROLE>_EMAIL` and `TRAINR_TEST_<ROLE>_PASSWORD` at runtime for each selected role, failing before page navigation if either is absent. The unused fixed-account export and stale README password table are removed. The guarded local seed now generates fresh random passwords for its three roles, hashes them, and prints sample credentials only after a successful local seed. The three previously fixed password strings no longer occur in the current `e2e`, `prisma/seed.ts`, or E2E README files; the committed history still contains them.

`npm run check` passed: lint 0 errors / 42 existing warnings, typecheck, 86 Vitest files / 1,833 tests, and production build (84/84 static pages). After removing two unused imports from `e2e/parent-flow.spec.ts`, direct ESLint on all three edited TypeScript files exited 0 with no findings. `npx playwright test --list` successfully enumerated 65 tests in the parent, trainer, admin, role-boundary and public-booking files; it did not execute them or use credentials. `git diff --check` found no whitespace errors. No destructive seed, hosted login with rotated credentials, or Production account-disable action was attempted.

## Remaining Gate

An owner or authorized administrator must rotate the three hosted passwords through the account-recovery flow, or use a non-destructive access-disable mechanism, then verify that the old credentials fail and replacement accounts/credentials work. The current admin `delete` action is **not** a safe substitute for simple suspension: it calls account closure and anonymizes data, and it cannot deactivate the sole active administrator or the acting admin. Do not use it merely to silence this finding. The password-change browser flow requires the account owner to complete entry and submission. Keep new credentials out of Git, reports, and chat.

**Pass/fail:** source-level future-exposure fix PASS locally; Production credential rotation/revocation **NOT VERIFIED**. No Stripe Checkout, transfer or payout conclusion follows from this fix.
