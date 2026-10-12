# Package Purchase History And Recovery

## Scope And Baseline

- Date: 2026-10-12 UTC. Baseline `74d83dbed6c55f8ac46a6aac5a297ca529018f0c`, branch `codex/payment-readiness-20261006`; initial worktree clean.
- Previous goal turn: progress, not a wait or blocker. Refund-history source and documentation were pushed, deployed to audit Preview and retested. This pass adds a reachable parent/trainer history and recovery workflow.
- Environments: guarded disposable PostgreSQL `trainr_audit_timezone_20261011`, role `trainr_test`, loopback port 55439; synthetic `example.test` accounts. Provider receipts are simulated in SQL tests. Hosted evidence will be recorded separately after publication.
- New routes: `/parent/packages`, `/trainer/purchases`, GET `/api/package-purchases`, POST `/api/package-purchases/refresh`. Existing parent dashboard and trainer catalog link to these screens.
- Overall production and money-flow verdict: **HOLD**. This is purchase history/reconciliation, not public package checkout, credit issuance/redemption, or bank-payout proof. Shared-family ownership is confirmed; expiry-start and early-cancellation restoration questions remain open.

## Implemented Behavior

History is scoped to the current authenticated parent or trainer, with role/deletion revalidation, bounded pagination, deterministic ordering and status filters. Saved package terms and amounts are displayed independently of later catalog edits. The public DTO excludes Stripe IDs, checkout parameters, payload hashes and detailed provider failure receipts. Parent responses omit trainer allocation. Database/read/schema failures are errors, never fabricated empty successes.

An owned payment refresh uses only a saved current checkout identity. It revalidates authority under a user lock inside the settlement transaction, locks the purchase, verifies current Stripe receipts and reads complete current refund history. Verified unpaid open/expired sessions remain unpaid without creating another checkout. Completed payments and late refund outcomes use the existing destination-charge/refund safeguards. The action creates no checkout, refund, credit, booking or wallet payout. A persistent per-user limit bounds provider refresh requests; unavailable limiting fails closed.

Both screens distinguish stored state from verified payment/refund evidence, show financial-review warnings and separate pending/failed refunds. Lost/malformed/provider-error responses require a current-history reload before another refresh. Session credits are explicitly unavailable; the screen does not invent balances or expiry dates. Trainer allocation is labeled separately from a link to Stripe payout status.

## Verification

| Exact steps | Expected | Actual / result |
| --- | --- | --- |
| Anonymous/unsupported-role GET and POST; ownership-changing, duplicate or malformed query/body | Deny before data/provider work; private uncached responses | PASS, unit |
| Exhaust/unavailable persistent refresh limiter | 429/503, Retry-After, no provider refresh | PASS, unit |
| Return incomplete DTO or saved success without receipt verification | Reject incomplete payload; no false paid/refunded label | PASS, unit |
| Read as purchasing parent and owning trainer after catalog edits | Original terms/price, correct ownership, role-specific allocation, no provider details | PASS, real SQL |
| Read/refresh another account's purchase or revoked/changed-role actor | Empty scoped list or 403/404 before provider work | PASS, real SQL |
| Refresh paid purchase before webhook completion, including pending refund | Current verified status/refund totals and review; no new money operation | PASS, real SQL with simulated provider |
| Refresh unpaid open/expired checkout | Preserve unpaid database row exactly; no create/expire call | PASS, real SQL |
| Missing/retired session, provider outage, wrong destination or incomplete refund history | Reject without replacing accounting | PASS, real SQL |
| Concurrent parent/trainer refresh | One refund record and one aggregate amount | PASS, real SQL |
| Null JSON financial review and pagination beyond last page | No false review; stable records and clamped page | PASS, real SQL |

- New API/response-contract unit suite: **35 passed**, 17.24 seconds; log `.postgres-test/package-history-unit.log` (local start 2026-10-11 22:06:56 PDT / 2026-10-12 05:06:56 UTC).
- Focused SQL suite: **162 passed**, 47.12 seconds; log `.postgres-test/package-history-sql-focused.log` (local start 22:07:45 PDT / 05:07:45 UTC). Includes 25 new history/recovery cases and all existing package checkout/refund cases.
- Full SQL integration suite: **601 passed in 14 files**, 227.23 seconds; log `.postgres-test/package-history-sql-full.log` (local start 22:09:27 PDT / 05:09:27 UTC), process exit 0. Independent SQL inspection confirmed the disposable database guard and zero users, bookings, package purchases and wallet entries afterward. The owned PostgreSQL instance was stopped before the build.
- Full `npm run check`: exit 0; lint zero errors / 43 existing warnings, type generation and TypeScript passed, **1,367 unit tests in 63 files passed**, production build passed (79 static-generation entries). Log `.postgres-test/package-history-check.log`; unit start 22:21:57 PDT / 05:21:57 UTC, 35.93 seconds. Existing middleware convention warning remains.
- No schema/migration changes in this pass. Browser and publication results follow when actually completed; no passing result is inferred from the SQL or build runs.

## Browser Baseline And Retest

The first 68-case affected-workflow run completed with **56 passed / 12 failed**, 11.1 minutes, exit 1 (`.postgres-test/package-history-browser.log`). Every failed error-context identified the same ambiguous `getByRole('alert')`: the expected purchase-history error and Next.js's hidden route announcer both matched. The expected application error text was present. The assertion is now scoped by its `Reload purchase state` content. This is a test-selector correction, not evidence of a repaired application error. The running suite retained its original compiled test module; its output is not counted as a clean retest even though the source was corrected before it finished.

Independent SQL guard/count inspection after that run confirmed zero users, bookings, package purchases and wallet entries. A fresh complete 68-case rerun was started with the corrected test source. Scope: 24 checkout-recovery, 8 dashboard, 24 package-history and 12 trainer-package cases, one Chrome worker, 1440px and 390px, synthetic accounts only. New history tests exercise navigation links, immutable price/terms after catalog changes, role-specific allocation, status filters, successful refresh, lost response, malformed response, provider failure, read failure, explicit reload, page refresh persistence, no new bookings/wallet entries, no page errors and no horizontal overflow. Payment-refresh provider responses are intercepted only in browser tests; the SQL suite separately verifies current receipt/ownership logic.

The corrected complete rerun passed **68 / 68**, 8.5 minutes, exit 0 (`.postgres-test/package-history-browser-retest.log`). All 24 new history cases passed, including every previously failing scenario. This is the affected browser suite, not a claim that every historical E2E file was rerun.

Desktop parent and mobile trainer history screenshots were visually inspected: long titles/email text wrap, amounts and controls fit, completed/pending/failed refunds remain separate. Preserved synthetic evidence: [parent desktop](evidence/package-history/parent-desktop.png), [trainer mobile](evidence/package-history/trainer-mobile.png).

After the clean run, independent SQL inspection verified the disposable guard and zero users, bookings, payments, packages, package purchases/refunds/checkout attempts, wallet entries and sports. The owned app server was interrupted only after test completion, and owned PostgreSQL stopped successfully. No required local test process remains running. Publication evidence follows after deployment.

## Remaining Gates

Public package buying, shared-credit ledger/issuance/redemption, cancellation/restoration/expiry policy, refund operations, account closure and actual hosted trainer onboarding/payment/transfer/payout testing remain incomplete. Email setup remains deferred by the owner. CI billing and dependency-security findings are still open. Main, Production, Story, credentials and actual funds are excluded from this pass.
