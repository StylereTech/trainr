# Trainer Payout History Pagination

## Scope And Baseline

- Date: 2026-10-12 UTC. Baseline `e9c0480bf882cc6f3d6831f9cf120e6cee55eebb`, clean audit branch `codex/payment-readiness-20261006`.
- Environments: local unit/API tests with simulated Stripe, owned disposable PostgreSQL and compiled local browser tests; isolated audit Preview only for publication. Main, Production, Story and real funds excluded.
- Users: synthetic authenticated trainer/parent fixtures. No real bank account or payout is modified.
- Surfaces: GET `/api/trainer/wallet`, optional `startingAfter` query; `/trainer/profile?tab=payouts`; shared payout response schema. No money-writing endpoint changes.
- P2 finding: the API always requested the latest 20 payouts, ignoring pagination input, and the trainer screen had no older-history controls. Its `hasMore` response was not validated or used by the UI. This prevented reviewing older payouts inside TRAINR.

## Reproduction

Added API cases requesting an older page, supplying five invalid/unsupported queries, and returning `has_more: true` without a payout cursor anchor. Baseline at **09:39:57 UTC**: **seven failed / eight passed**, 4.18s, exit 1; `.postgres-test/payout-history-pagination-baseline.log`. The older cursor was not forwarded, invalid queries returned 200, and an incoherent provider page returned 200. The old implementation still selected the authenticated trainer account; these failures are not evidence of a reproduced cross-account disclosure.

## Implementation

- Server accepts only a bounded payout-ID cursor; duplicate and unknown query parameters return 400 before provider calls. The connected account always comes from the authenticated trainer profile, never a query parameter. Page size remains 20.
- Uses Stripe's documented [`starting_after` payout pagination](https://docs.stripe.com/api/payouts/list), returning required `hasMore` and a matching `nextCursor`. [Cursor semantics](https://docs.stripe.com/api/pagination) preserve reverse-chronological listing.
- Stripe balance/payout/account reads have 10-second deadlines and no automatic network retries. Account identity, repeated request anchors, duplicate payout IDs, missing page flags and mismatched cursor evidence produce a generic 503 without fabricated balances/history or raw provider diagnostics.
- The trainer screen has icon-based newer/older controls with accessible names/tooltips, page indication, bounded page replacement, retry, and newest-page refresh. Older empty pages use distinct wording; read failures never claim there are no payouts. Balances remain current Stripe balances, not totals of the displayed payout page.
- No charge, refund, transfer, withdrawal, bank payout, wallet write or database migration is introduced. Manual/automatic Stripe schedules and the existing Stripe dashboard path remain distinct.

## Verification

- Focused API/contract retest at **09:43:43 UTC**: **42 passed / two files**, 990ms, exit 0; `.postgres-test/payout-history-pagination-focused.log`.
- Cases cover cursor forwarding with the owned account, query rejection before provider access, terminal empty pages, malformed pagination, duplicate IDs, repeated anchors, mismatched account identity, provider failure redaction, negative Stripe balances, role denial and existing no-second-withdrawal safeguards.
- Full `npm run check`: passed, exit 0; lint zero errors / 42 existing warnings, typecheck, **1,433 units / 66 files**, optimized 81-page build. Unit phase started **09:48:45 UTC**, 42.18s; compilation 117s and build TypeScript 41s. Log: `.postgres-test/payout-history-pagination-check.log`.
- Full disposable PostgreSQL suite: **684 passed / 15 files**, started **09:53:54 UTC**, 184.50s; `.postgres-test/payout-history-pagination-sql.log`. The original shell completed; its session handle was lost during context rollover, so the final Vitest summary and independent process-exit observation are the evidence, not a recovered original shell exit code. No schema change or new migration is included.
- Compiled local Chrome, 1440/390px: **30 passed**, 3.9m, exit 0, completed by **10:02 UTC**; `.postgres-test/payout-history-pagination-browser.log`. Payouts (14), Connect (8) and parent/trainer dashboard (8) cases ran with one worker and no retry. These are focused representative browser suites, not a fresh all-file E2E run.
- New browser cases verified the 21st payout, subsequent empty page, backward navigation, retry after malformed/failed reads, newest-page refresh and parent API denial. Existing checks verified timeout recovery, invalid redirects, unlinked trainer state and database-backed dashboard persistence. Provider reads for linked accounts are simulated; authentication and unlinked/role-denial reads use the real local app.
- Visually inspected [mobile](screenshots/payout-history-page-two-390.png) and [desktop](screenshots/payout-history-page-two-1440.png) second-page captures: readable labels, no overlapping controls, no horizontal overflow. Screenshots contain synthetic balances/payouts, not actual Stripe receipts.
- Independent SQL cleanup confirmed the disposable guard, expected database/user, and zero users/bookings/payments/package purchases/credit grants/account closure tasks; `.postgres-test/payout-history-pagination-cleanup.log`, exit 0. Owned app and PostgreSQL servers stopped after verification. Focused lint and `git diff --check` passed.

## Publication And Remaining Gates

Not yet committed or published. Real hosted trainer login, Stripe onboarding, actual customer sandbox payment, transfer and payout evidence remain unverified. Signed-in Preview access still awaits approval; package expiry/cancellation decisions and redemption/public buying remain unfinished. This improves payout-history access, not money-flow signoff. Overall production status: **HOLD**.
