# Checkout And Account Closure Review Holds

Status at **2026-10-13 14:13 UTC**: focused/full SQL, repository quality gate and 46 browser cases pass locally; publication pending. Overall launch readiness remains **HOLD**.

## Baseline And Scope

- Baseline commit: `c191a44e5b27a0877835004205eed227c4a84d54`, audit branch `codex/payment-readiness-20261006`, clean at entry.
- Environment: owned disposable PostgreSQL `trainr_audit_timezone_20261011`, `127.0.0.1:55439`, role `trainr_test`; purpose marker `disposable integration database`. Synthetic parent/trainer/admin fixtures only; provider calls simulated. No hosted credentials, Production/main, Story, billing or real funds changed.
- Findings: cash checkout omitted review/refund/verified-settlement indicators; cancellation recovery could create a session despite a hold and claim closure after expiry. Account-closure queues used JSON truthiness, confusing held JSON null/false/zero/empty-string values with SQL NULL.
- Severity: high financial-state integrity risk. SQL NULL alone means no review. A held link can be contained by expiry, but expiry does not resolve its financial review.

## Reproduction And Retest

Integration entry points: `startOrResumeCheckout`, `closeCancelledCheckout`, `processAccountCheckoutClosure`. Their cash checkout, booking cancellation and account-retirement callers are exercised by the wider regression suite; these focused cases invoke the functions with real SQL and simulated provider responses, not live Stripe HTTP requests.

| Steps | Expected result | Baseline | Focused retest |
| --- | --- | --- | --- |
| Create a cash checkout, apply each of eight review/refund/settlement holds, retry | Reject before provider access; preserve payment and original attempt | Failed | PASS, 8 cases |
| Apply each hold while provider creation returns | Retain provider identity, withhold URL, expire open/unpaid session | Failed | PASS, 8 cases |
| Cancel held booking with known session, close checkout | Expire open/unpaid link; retain payment state; return review required | Failed (one case already returned review but redundantly changed updatedAt) | PASS, 8 cases |
| Simulate lost create request, apply hold, cancel and recover | Return review without issuing a create request | Failed | PASS, 8 cases |
| Close parent account with cash/package review in five JSON forms; process queue | Expire link but leave queue in REVIEW, not CLOSED | Eight failed; object-held controls passed | PASS, 10 cases |

- Baseline: **40 failed / 2 passed**, start **13:49:38 UTC**, duration **35.89 seconds**, 133 filtered cases. Log: `.postgres-test/checkout-review-baseline.log`. The pending-refund known-session case failed only because the existing code redundantly updated its saved session and timestamp, not because it falsely claimed closure; the other bypass assertions reproduced directly.
- One sandbox test invocation could not load esbuild configuration due Windows directory permissions; no tests ran. Re-ran with reviewed escalation using the same local database and mock provider.
- Focused retest: **42/42 passed**, start **13:53:12 UTC**, duration **10.77 seconds**, 133 filtered cases. Log: `.postgres-test/checkout-review-focused.log`.
- Full SQL regression: **1,061/1,061 passed**, 16 files, start **13:53:54 UTC**, duration **163.21 seconds**, terminal exit 0. Log: `.postgres-test/checkout-review-postgres.log`. Independent read afterwards confirmed the disposable marker and zero rows in ten fixture tables.
- Full quality gate: **PASS**, terminal exit 0 before **14:05 UTC**. Lint: zero errors, 42 existing warnings; types pass; **1,606/1,606 unit tests**, 75 files, start **14:00:08 UTC**, duration **104.83 seconds**; Prisma generation and optimized Next build pass. Log: `.postgres-test/checkout-review-check.log`. Middleware deprecation is still emitted. The previously observed Edge-runtime warning was not emitted in this build; no related source fix was made.

## Fix

Capture `financialReview IS NOT NULL` within existing financial-row locks and fail closed if the locked row does not match. Cash checkout uses a shared local predicate for charge, transfer, verified settlement, refunds and review presence. Recheck after external calls, commit returned session identity before withholding and best-effort expiry, and prevent blind cancellation recovery on held records. Known sessions remain eligible for containment, not automatic financial signoff. Avoid redundant identity writes during cancellation. Preserve lock ordering, existing status rules and free-booking handling. Account closure uses the same SQL-presence semantics for both cash and packages. No migration changed.

## Browser And Cleanup Evidence

- **46/46 passed**, 7.2 minutes, one worker, zero retries, completed before **14:13 UTC**. Log: `.postgres-test/checkout-review-browser.log`. Built app `http://127.0.0.1:3108`, owned disposable SQL, randomly generated synthetic accounts; viewports 1440x1000 and 390x1000.
- Command: `npm run test:e2e -- e2e/account-checkout-closures-local-regression.spec.ts e2e/cancellation-local-regression.spec.ts e2e/checkout-recovery-local-regression.spec.ts --workers=1 --retries=0`.
- Routes: `/admin/users`, `/admin/checkout-closures`, `/admin/bookings`, `/account/delete`, `/parent/dashboard`, `/book/[slug]`; corresponding user/account/closure/booking APIs. Checkout HTTP responses and provider navigation are explicitly simulated; booking persistence, revocation and missing-identity retirement use real local HTTP/SQL.
- Steps: revoke role, load/reload closure queue, reject parent access, recover lost/malformed/read-failed responses, cancel and reconcile a booking, exercise checkout from dashboard and booking form with processing/timeout/invalid JSON/unsafe URL/success responses. Expected and actual: no duplicate booking, no unproven payment/closure claim, durable review, usable recovery controls and no horizontal overflow. All named cases PASS; not proof of all platform flows.
- Four screenshots visually inspected: [cancellation desktop](screenshots/checkout-review-cancellation-1440.png), [cancellation mobile](screenshots/checkout-review-cancellation-390.png), [closure desktop](screenshots/checkout-review-closure-1440.png), [closure mobile](screenshots/checkout-review-closure-390.png). Controls, headings and review text remain legible without overlap. No CSS change in this pass.
- Final independent SQL check confirmed the purpose marker and zero rows in ten fixture tables. Local Next process and owned PostgreSQL cluster stopped. No user data was removed.

## Remaining Work

Audit-Preview publication/retest is pending for this source change. Actual hosted Stripe checkout, trainer Connect, transfer/payout and email remain unproven; owner trainer signup handoff is still pending (fresh UI check: blank credential fields and unchecked terms). Package-settlement replay and dependency advisory reachability remain separate audit work. GitHub CI was previously proven unable to start due account billing; no current-pass CI result is claimed here. Fresh GitHub read confirms main remains `2067e743c54ffee669cd484f26dc472b157f1881`.
