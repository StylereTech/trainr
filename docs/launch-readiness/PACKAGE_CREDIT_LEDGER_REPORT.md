# Package Credit Ledger Verification

## Scope And Identity

- Date: 2026-10-13 UTC. Baseline/source parent: `efa28013fda319d827d3f11215dce4ecc7f92cc3`; publication evidence for this tested ledger revision is recorded below.
- Environment: owned disposable PostgreSQL at loopback `127.0.0.1:55439`, database `trainr_audit_timezone_20261011`, user `trainr_test`, guard `disposable integration database` verified before writes. No hosted credentials used.
- Accounts: fresh `credit-parent-*`, `credit-other-*`, and `credit-trainer-*` synthetic `@example.test` fixtures; two owned synthetic children and one unrelated child. Password hashes are deliberately not usable logins.
- Surfaces tested: transaction-only `redeemPackageCredit` / `restoreCancelledPackageCredit`, real SQL triggers, immutable package receipts/grants, booking/payment tables. **No customer-facing route enables credit redemption yet.**
- Stripe evidence: explicit synthetic SQL receipts, not real Stripe requests, charges, transfers, refunds, or payouts. Zero new booking-payment and wallet records in the credit-spending positive case.
- Isolation: main, Production, Story, Replit, live Stripe, billing, credentials, and binding account agreements excluded.

## Changes

The new ledger binds exactly one credit to a booking and to a purchased service grant. Parent ownership is shared across their children, not transferred to a child. Restoration retains the original consumption record and does not change the payment receipt or expiry. A purchase-row version change serializes sibling spending, including stale repeatable-read transactions.

SQL rejects unverified/reviewed/refunded purchases; missing or mismatched immutable receipts; expired or future-dated validity; wrong parent, child, trainer or service; changed sport/duration/type; inactive eligibility; missing grants and exhausted balances. A credit booking has zero *new* money due and no booking payment, rather than a fabricated zero-dollar Stripe receipt. Once funded, its identity and funding cannot be rewritten or its terminal outcome reopened.

Parent cancellation at least 24 elapsed hours early and owning-trainer cancellation may restore once. Late parent cancellation and no-show do not restore. Server/database time overrides caller-supplied restoration timestamps. Admin restoration has no invented policy and is rejected by these primitives. Cash refunds remain separate.

Pending product decision: the provisional, fail-closed ledger requires the session to start before expiry, not just the booking action. The user has been asked which rule they intend. Do not enable the public flow until that question and its customer wording are resolved.

## Exact Verification

1. Validate and generate the Prisma client: schema valid; generation succeeded.
2. Start only the owned local PostgreSQL instance. Initial sandbox launch failed with Windows restricted-token error 87. The scoped permitted retry succeeded. Independently verify database name, user and guard.
3. Apply the additive migration to the disposable database. Initial local Vitest launch failed before tests due to esbuild parent-directory access denial. The scoped local retry ran normally.
4. Run `tests/integration/package-credit-ledger.integration.ts`: first **83/83 passed**, 47.26 seconds, start 2026-10-13 05:33:49 UTC.
5. Add three negative receipt-identity tests. All three **failed as expected on the incomplete implementation**: changing a nonempty PaymentIntent, charge or Checkout ID still allowed spending. This was a defect in the unpublished ledger, not a hosted production incident.
6. Correct SQL receipt matching and restrict the payment trigger to inserts or booking-ID reassignment, avoiding unnecessary locks on ordinary settlement updates.
7. Rebuild only the unpublished ledger migration in the owned empty local database. The rollback script asserted exact database/user/guard and zero booking/payment/purchase/redemption rows before removing only this new table/functions/triggers and its local migration record. All previously published migration history was left intact. Reapply corrected migration successfully. This was not a hosted rollback or a silent checksum rewrite.
8. Add surrounding-transaction rollback coverage. Rerun the entire focused file: **87/87 passed**, 17.25 seconds, start 2026-10-13 05:37:38 UTC. Log: `.postgres-test/credit-ledger-focused-final.log`.

Expected and actual results match for family sharing, exact retry identity, last-credit races under ReadCommitted and RepeatableRead, concurrent payment-vs-credit attachment, denied outsiders, payment/review/refund holds, expiry, service eligibility, a direct SQL price-only change with unchanged service identity, one-time cancellation restoration, late consumption, no-show rejection, rollback, immutable history, and no second charge. The independent Prisma client verifies persisted rows after commits. The price-only case does not exercise the trainer editor's version/replacement workflow.

Failure logs retained locally: `.postgres-test/credit-ledger-receipt-reproduction.log`, `.postgres-test/credit-ledger-focused.log`. The latter was the successful first scoped retry; sandbox startup failure is recorded in this report.

### Broader Regression Recovery

The first full SQL run ended with **822 passed / 1 failed** across 16 files, 611.09 seconds, start 2026-10-13 05:38:23 UTC. The failing `ignores connected-account charge.updated without provider lookup or financial mutation` case reached its final independent notification read and reported `Can't reach database server at 127.0.0.1:55439`. PostgreSQL recorded a host-aborted client connection at 05:42:18 UTC, not a server restart or crash. Subsequent independent guard/cleanup queries succeeded with users, bookings, payments, purchases, redemptions and sports all zero. Cause beyond that connection evidence is not established.

The exact case then passed unchanged: 1 passed / 135 unrelated cases skipped, 6.47 seconds, start 05:49:11 UTC; actual test 396 ms. No assertion, timeout or production code was weakened. The full-suite retest passed **823/823 across 16 files**, 341.40 seconds, start 05:49:35 UTC. Logs: `.postgres-test/credit-ledger-full-sql.log`, `.postgres-test/credit-ledger-stripe-retest.log`, `.postgres-test/credit-ledger-full-sql-retest.log`.

Before publication, a schema review also found the first draft's 65-character index name was silently truncated by PostgreSQL to a different name than Prisma's default. The source migration now uses the expected 63-character name. This is index-name metadata only; the guard functions, keys and indexed columns are unchanged. The owned empty database was rebuilt using the same guarded unpublished-migration procedure before final migration rehearsal. The further full SQL run against this final schema passed **823/823, 16 files**, 303.51 seconds, start **06:03:44 UTC**, followed sequentially by a successful `npm run check`.

All four final migration rehearsals passed between **05:56:00 and 06:02:35 UTC**: fresh, legacy, phone history, and account-closure history. Each verified 23 checksums/completed migration records, Prisma schema parity and no-op replay. All 12 seeded legacy tables were preserved with only intended historical revocation/default changes; the account-closure backfill did not invent provider closure. All four owned rehearsal databases were removed by the guarded harness. Log: `.postgres-test/credit-ledger-migrations.log`.

Final repository quality gate, **06:08:48-06:19:43 UTC**, exit 0: lint 0 errors / 42 pre-existing warnings; route generation and TypeScript pass; **1,501 unit tests / 69 files**, 66.69 seconds, start 06:15:28 UTC; optimized build compiled in 39 seconds, build TypeScript 51 seconds, all 81 pages generated. Logs: `.postgres-test/credit-ledger-check.log`, `.postgres-test/credit-ledger-final-schema-sql.log`. No app or schema code changed after this gate.

### Browser Recovery

The first representative desktop/mobile run completed **63 passed / 1 failed**, 14.8 minutes, one worker and zero automatic retries. Coverage was 16 booking-price cases, 24 checkout-recovery cases, and 24 parent/trainer package-history cases at 1440px and 390px. This is not the entire repository's browser suite or a public credit-booking flow.

Failure: desktop booking-entry timeout recovery exhausted the global 30-second test budget during its final dashboard reload. The trace shows the original recovery URL assertion passed in 19.15 seconds (its bound remains 20 seconds), the pending/unpaid assertions passed, and the retry reached the intercepted synthetic Checkout destination. Timed-out teardown also reported a booking foreign-key error while attempting user cleanup. Subsequent scoped inspection and independent final guard queries found zero users, bookings, payments, purchases, redemptions and sports. No manual row deletion was needed. Preserved failure: `.postgres-test/credit-ledger-browser-first-failure`; original run: `.postgres-test/credit-ledger-browser.log`.

Harness correction: only the four deliberate timeout scenarios now receive a 60-second whole-test budget to accommodate the real 15-second native abort, initial reservation, retry and final reload. The application `AbortSignal.timeout(15000)`, 20-second recovery assertions, other assertions and all other test budgets are unchanged. No browser-clock replacement or shortened network timeout was introduced. TypeScript passed again after this test-only change (`.postgres-test/credit-ledger-final-typecheck.log`). The exact failed case then passed in **31.1 seconds**, 37.8-second run (`.postgres-test/credit-ledger-browser-focused.log`).

The complete representative rerun passed **64/64**, 11.8 minutes, between **06:40:36 and 06:52:27 UTC**, one worker and zero automatic retries. The original failing case passed in 26 seconds. Log: `.postgres-test/credit-ledger-browser-retest.log`. Independent final database reads verified zero users, bookings, payments, purchases, grants, receipts, redemptions and sports; both owned local servers were stopped afterward. This is synthetic local browser evidence, not a provider payment receipt or hosted account test.

Visual review found readable large totals, wrapped long package names, and no visible content overlap. Browser assertions also checked document overflow. Preserved representative artifacts: [parent mobile history](screenshots/package-credit-ledger-parent-390.png), [desktop maximum-price review](screenshots/package-credit-ledger-price-1440.png). The history screenshot intentionally retains **Session credits unavailable**.

### Dependency Audit

The restricted read-only production audit failed to reach the registry and write its external cache log. A bounded, permitted retry using the official npm registry and the repo-local ignored cache succeeded: `npm audit --omit=dev --json` returned exit 1 with **six high / zero critical entries**, all tracing to the `braces` advisory through Tailwind's peer/transitive dependency tree. This is one underlying advisory, not six independent vulnerabilities. No dependencies were installed or changed.

On 2026-10-13 the [upstream advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) identifies deeply nested brace patterns as a stack-exhaustion risk, covers the installed 3.0.3 version and lists no patched release. Remediation/reachability assessment remains open, not waived as dev-only. This production-only query does not supersede the earlier full dependency audit count. Evidence: `.postgres-test/credit-ledger-production-audit.json`; exact chain recorded in `DEPENDENCY_SECURITY_REPORT.md`.

## Remaining Gates

- Final-schema SQL, unit/static/build gate, all four migration rehearsals and the selected 64-case browser rerun passed. This is not the entire application E2E matrix or a signed-in hosted audit.
- Public purchase and credit-booking routes, balance/history display, atomic booking/cancellation integration, sanitized dashboard funding state and payment-review holds: still incomplete. Existing UI correctly continues to say credits are unavailable.
- Existing `saveTrainerServices` versions/replaces referenced offerings and retires affected package listings. Public activation must test and define treatment of prepaid credits when an offering is replaced or retired; the ledger deliberately rejects inactive services. The direct SQL price-change test is not proof that the trainer editor preserves bookable prepaid entitlements. No customer-facing redemption or replacement policy is enabled by this pass.
- Signed-in hosted trainer/parent flow, actual sandbox Checkout, webhook delivery, Connect onboarding, transfers/payouts and final live smoke: not proved by this pass.
- Hosted browser review remains blocked by the prior approval-service usage-limit response. A retry request is pending; no alternate browser/API route was used to retrieve the blocked Vercel log or execute the blocked navigation.
- GitHub CI account billing lock was observed in the previous pass, not freshly reverified here. The fresh production dependency audit above remains unresolved; prior full-tree findings are not silently waived.

Overall release decision: **HOLD**. This is tested internal infrastructure, not completed package booking or production signoff.

## Publication

Pending commit/push and post-publication checks. The remote audit branch was freshly fetched and matched the baseline above; `origin/main` remained `2067e743c54ffee669cd484f26dc472b157f1881`. No main merge, production promotion or Story change is authorized by these test results.
