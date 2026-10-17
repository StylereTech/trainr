# Production Smoke Command Repair

- Date/time: 2026-10-16 10:48 UTC (03:48 America/Los_Angeles).
- Source: audit branch `codex/payment-readiness-20261006`, baseline `79639fe08d6509dd5e0403f69a119f2bf00a8d9b`, plus this command/test change. Main and Production code were not changed.
- Environments: `https://trainr-git-codex-payment-readiness-20261006-styleres-projects.vercel.app` and `https://trainr.cc`; Windows PowerShell, installed Chrome, one Playwright worker.
- Accounts/data: anonymous browser and API contexts only. No demo or real credentials, financial data, booking writes, webhook submission, or Stripe calls.

## Defect And Fix

`npm run test:e2e:prod` used POSIX `BASE_URL=...` assignment on Windows and selected `role-boundaries.spec.ts`, whose signed-in cases depend on legacy demo credentials not present in the isolated audit Preview. A run could therefore fail before testing, or be mistaken for valid role coverage. The command now selects `production-smoke.spec.ts` and uses the Playwright config's default `https://trainr.cc` base URL. `BASE_URL` can explicitly target an HTTPS Preview. The new suite uses read-only public navigation, health/catalog GETs, and anonymous protected-page/API GETs. Authenticated role and payment tests remain separate launch gates.

## Steps And Results

| Steps / routes | Expected | Actual | Result |
| --- | --- | --- | --- |
| `BASE_URL=<audit Preview>` then `npm run test:e2e:prod`; `/`, `/browse` | H1 and catalog navigation render | 1/1 public-entry case passed | PASS Preview subset |
| Same run; `GET /api/health`, `GET /api/trainers?limit=1&page=1` | DB connected, valid catalog envelope | 1/1 health/catalog case passed | PASS Preview subset |
| Same run; `/parent/dashboard`, `/trainer/dashboard`, `/admin`, `/messages`; `GET /api/athletes`, `/api/trainer/stripe-connect`, `/api/admin?tab=overview` | Anonymous pages redirect to sign-in; APIs reject 401/403 | 1/1 access case passed; overall **3/3 in 15.0s** | PASS Preview subset |
| Unset `BASE_URL`; `npm run test:e2e:prod` against `trainr.cc` | Same read-only contracts | **3/3 in 13.9s** | PASS Production subset |
| `npm run check` | lint/type/unit/build complete | Exit 0; lint 0 errors/42 warnings; typecheck; **1,790/1,790 unit**; optimized build | PASS local gate |

No authenticated parent/trainer/admin assertion, successful booking, paid Checkout, signed webhook, destination transfer, bank payout, refund, or refresh persistence was tested by this smoke. The isolated test trainer's Connect account remains restricted. No screenshot was needed for the API/status assertions; Playwright produced ordinary local test artifacts. **Production HOLD.**

## Published Retest (2026-10-16 10:53 UTC)

- Commit `818c2b1282803d33631037cd4a0bbf6fe8d81915` was fetched from GitHub; local HEAD and origin matched with a clean tracked worktree. Vercel showed its Preview deployment `2XvaJqgArymiuDJPaBA7FPMNWCj8` **Ready / Latest**, and its Domains panel assigned `trainr-git-codex-payment-readiness-20261006-styleres-projects.vercel.app` to this exact source.
- With PowerShell `$env:BASE_URL` set to `https://trainr-ir5aw8bnh-styleres-projects.vercel.app`, `npm run test:e2e:prod` **failed 3/3** because that immutable deployment URL redirected the unauthenticated test browser to `vercel.com/login` under Deployment Protection. This is an access boundary, not an application-role result. The screenshot/error context is in ignored `test-results/production-smoke-*/` artifacts. Protection was not bypassed or changed.
- Retest via the Vercel-assigned public audit-branch alias above: **3/3 passed in 11.3s**, exercising the same public navigation, DB/catalog health and anonymous route/API rejection on the published source. `trainr.cc` had separately passed 3/3 before the audit-branch push; Production was not updated by this commit.
- The immutable-URL failure remains a harness limitation for deployment-specific links without an authorized bypass token. The source-attributed branch-alias pass clears this read-only smoke subset only. Authenticated roles and actual Stripe settlement remain open; **Production HOLD**.
