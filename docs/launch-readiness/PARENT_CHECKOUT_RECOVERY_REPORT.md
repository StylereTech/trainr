# Parent Checkout Recovery Audit

## Identity And Scope

- Date/time: 2026-10-11 UTC; verification timestamps and publication below.
- Baseline: `b31252dfa1a3c8d8521b011a05d3d5dd3e4d16c1` (same application source as `d7460ab`).
- Environment: optimized local Next app on `http://127.0.0.1:3107`, guarded disposable PostgreSQL `trainr_audit_20261008` on loopback port 55439, installed Chrome.
- Accounts: generated synthetic PARENT/TRAINER users under `example.test`. No production account, real child data, Stripe secret or actual money movement.
- Routes: `/book/[slug]`, `/api/bookings`, `/parent/dashboard`, `/api/dashboard/bookings`, `/api/athletes`, and browser checkout handoff via `/api/payments/checkout`.
- Scope: real local reservation/dashboard HTTP and SQL; checkout/provider responses and navigation are simulated. This is not provider settlement, destination transfer or payout proof.

## Findings And Changes

Source inspection found an unbounded dashboard checkout POST, unvalidated redirect URLs at both parent entry points, unchecked error bodies passed to React toasts, and stale dashboard payment state after a checkout conflict. A pending booking with a PROCESSING payment was also described as Awaiting payment.

Both entry points now use a single 15-second request with a validated HTTPS `checkout.stripe.com` destination. Credentials, unexpected ports, other hosts, malformed success bodies and non-text error bodies are rejected safely. No request is automatically retried. The dashboard uses a synchronous in-flight guard and refreshes persisted booking data after every checkout failure before restoring its actions. Its persistent error includes a refresh control; PROCESSING is displayed accurately and does not offer Pay now. The booking page retains the existing saved reservation and returns to its dashboard on checkout failure. Prices, fees, server idempotency and destination routing are unchanged.

## Runtime Recovery

The first browser run failed before reaching application assertions because the existing runtime's `E:` drive was no longer mounted. This is an infrastructure failure, not a reproduced application defect. Downloaded PostgreSQL 16.15 Windows binaries from the [official EnterpriseDB archive page](https://www.enterprisedb.com/download-postgresql-binaries), Windows archive link `https://sbp.enterprisedb.com/getfile.jsp?fileid=1260623`. SHA-256 `43BB45F173A6F08CF1D29A97A6D8DEB119E8E8093A24C00D2D1001A0CCAA8281` matches the earlier audit's local fingerprint; it is not an independently published checksum.

Stopped the optional full-archive extraction during pgAdmin extraction and extracted the remaining server share files directly. Server runtime now resides outside the repository at `C:\Users\style\Downloads\Telegram Desktop\.trainr-postgres-runtime-20261011\pgsql`; no Windows service was installed. Reused only the existing disposable cluster. `trainr_test_guard` returned exactly `disposable integration database`; baseline user count was zero. No Preview/Production database or environment was changed.

## Verification

- Focused unit tests: **37/37 PASS**, exit 0, covering accepted test/live Stripe-hosted URLs, rejected destinations, response/error shape validation, exact saved booking POST, 15-second deadline and no automatic retry.
- TypeScript: **PASS**, exit 0.
- Baseline browser reproduction: **FAIL as expected**, after infrastructure recovery, on the unchanged optimized baseline build. The test creates a real local unpaid reservation, clicks Pay now, persists a synthetic PROCESSING payment while returning checkout HTTP 409, then expects the refreshed payment badge. Actual page still shows Payment not recorded, Awaiting payment and Pay now; `Payment: PROCESSING` is missing. Screenshot inspected at `test-results/checkout-recovery-baseline-warm/checkout-recovery-local-re-9823e-icating-or-claiming-payment-chromium/test-failed-1.png`. Command: installed Playwright CLI, `test e2e/checkout-recovery-local-regression.spec.ts --project=chromium --workers=1 --reporter=list --grep 'checkout dashboard 1440px.*processing' --output=test-results/checkout-recovery-baseline-warm`.
- An intermediate restored-database run failed at the initial dashboard read before clicking Pay now and briefly raced fixture teardown; this is not counted as checkout proof. After restarting the old local app against the restored database, the same unchanged test reached checkout and failed its intended state assertion. Independent SQL showed zero users/sports after teardown.
- Full check: **PASS, exit 0**, approximately 07:13 UTC. Lint (existing warnings), TypeScript, **1,053/1,053 unit tests in 52 files**, Prisma generation and optimized 73-page build. Existing Browserslist freshness warning remains; this is not a warning-free claim.
- Focused repaired browser test: **PASS, 1/1**, same processing case, 11.8-second test / 18-second run. No assertion or timeout relaxation. Actual local SQL now reads back PROCESSING; the page shows Payment processing and removes Pay now. Screenshot inspected. The unchanged baseline [before image](evidence/checkout-recovery-20261011/processing-before.png) preserves the contradictory unpaid state.
- Initial broad run passed all eight reservation retries and all six desktop dashboard checkout cases, then exposed a fixture defect: the synthetic athlete lacked the selected sport. The application correctly returned Choose an athlete registered for this sport before reaching checkout. Stopped that run, added sport membership to the synthetic athlete fixture, and removed exactly its two leftover test users and one test sport after checking the disposable guard. Independent SQL then counted zero users/bookings/payments/sports. Application code, checkout assertions and deadlines were not changed to accommodate this fixture failure.
- Corrected booking-entry focused case: **PASS, 1/1**, 11.4-second test / 15.3-second run at approximately 07:20 UTC; real reservation now reaches the simulated checkout conflict and reads back PROCESSING correctly.
- Final desktop/mobile browser matrix: **PASS, 40/40 in 5.2 minutes, exit 0**, completed by 07:26 UTC. Installed Playwright CLI command: `test e2e/checkout-recovery-local-regression.spec.ts e2e/booking-retry-local-regression.spec.ts e2e/dashboard-local-regression.spec.ts --project=chromium --workers=1 --reporter=list --output=test-results/checkout-recovery-verified`. No skips, automatic retries, assertion relaxation or deadline increases.
- Checkout matrix: **24/24**, dashboard/new-booking entry points at 1440/390px. For each: simulate PROCESSING/409, a stalled request, non-text server error, non-JSON success, untrusted URL and valid Stripe-hosted URL. Expected and actual agree: one initial request, at most one explicitly requested retry for the same booking, no untrusted navigation, usable recovery, unchanged one-booking SQL count after reload, no paid state fabricated by navigation. The stalled request recovers under the unchanged 20-second UI assertion; the application deadline is 15 seconds. PROCESSING is synthetic SQL state, not actual payment proof.
- Existing reservation retry matrix: **8/8**, including committed/lost response recovery, malformed response recovery, cancelled and zero-due paths. Existing dashboard matrix: **8/8**, real SQL pagination, persisted actions and read-failure recovery; its seeded payment state/provider observations are not actual financial transactions.
- Inspected [desktop processing recovery](evidence/checkout-recovery-20261011/processing-after-desktop.png), [mobile error recovery](evidence/checkout-recovery-20261011/recovery-after-mobile.png), and [mobile booking processing state](evidence/checkout-recovery-20261011/processing-booking-after-mobile.png). Error text wraps and the new controls fit; browser assertions found no horizontal overflow. Raw traces remain ignored because they contain local session material.
- Independent SQL cleanup: **PASS**, 07:26 UTC, zero users/bookings/payments/sports. Local application stopped and disposable database shut down cleanly. No schema, migration or hosted database writes.
- Commit, push, isolated Preview deployment and hosted smoke: verified below.

## Publication And Hosted Smoke

2026-10-11 07:30 UTC: source `59a8a649b409131888bfcbf4984abd6d5b3fcd4d` is committed and pushed on `codex/payment-readiness-20261006`; HEAD and origin tracking SHA match with a clean worktree. Vercel audit project `trainr` deployment `ptrE86qKnDcH6hEKyHAW37P9AqMK` is **Ready**, Preview, build duration 1m 5s. Deployment Details identifies that source and maps the stable branch alias. Unique URL: `https://trainr-h273sduoo-styleres-projects.vercel.app`.

Hosted smoke used the existing owner-signed-in PARENT on `https://trainr-git-codex-payment-readiness-20261006-styleres-projects.vercel.app`, without mocked responses, injected cookies or new hosted records:

1. Reload `/parent/dashboard`: expected retained parent session and current persisted state; **PASS**, one saved athlete, zero bookings and no upcoming sessions.
2. Select Past (0): expected empty history; **PASS**, No past sessions yet and disabled pagination, page 1 of 1.
3. Open the existing synthetic athlete: expected unchanged saved fields; **PASS**, Sandbox Athlete, 2014-01-15, Intermediate, Basketball/Soccer and synthetic-only goals/notes remain intact.
4. Open `/book/audit-missing-checkout-20261011`: expected recoverable missing trainer state; **PASS**, Trainer Not Found with Browse Trainers link rather than a crash.
5. Follow Browse Trainers, then Reset search: expected usable unfiltered search; **PASS**, filter count/state chip removed and completed search shows 0 trainers found / No trainers found, not an error. There is no reachable trainer offering for hosted paid-booking verification.
6. Return to `/parent/dashboard`: **PASS**, parent heading/session retained. No hosted booking or payment was created.

The actual hosted checkout recovery controls cannot be exercised with this empty parent account and empty trainer catalog. Their populated-state evidence is the local SQL/browser matrix above. Actual Stripe-created URLs, payments, transfers and payouts remain unverified; only the existing Stripe-hosted checkout origin is accepted, and any future custom checkout domain would require explicit configuration/review. This publication evidence is committed separately without changing application source. Main, Production and Story were not changed.

## Remaining Gates

Production and money-flow signoff remain **HOLD**. The owner-signed-in hosted account is a parent with no bookings. Actual trainer onboarding, a provider-created Checkout session/payment, destination transfer, bank payout, packages and time-zone policy remain incomplete or unverified. Resend remains owner-deferred; no verification bypass, Production promotion or Story configuration change.
