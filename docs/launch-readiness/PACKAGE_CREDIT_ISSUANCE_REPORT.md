# Package Credit Issuance Report

## Scope And Status

- Date: 2026-10-12 UTC / PDT; baseline `d1a6edd870e712402b0cd4bc89f4d9d82b059549` on `codex/payment-readiness-20261006`.
- Environments: owned loopback PostgreSQL `trainr_audit_timezone_20261011` on port 55439 and separately tagged disposable migration databases. Planned publication is the isolated audit Preview only; main, Production, Story, real funds and account credentials are excluded.
- Accounts: generated `example.test` parents/trainers; synthetic Stripe sessions, signatures and destination receipts. These are not actual Stripe receipts or bank payouts.
- Surfaces: package checkout settlement and financial-event reconciliation, `POST /api/payments/webhook`, `GET /api/package-purchases`, `POST /api/package-purchases/refresh`, `/parent/packages`, `/trainer/purchases`.
- Owner decision: package credits belong to the parent and are shared across their children. Expiry start and cancellation restoration remain unanswered. Public purchase and credit redemption remain unavailable; this pass must not be called an end-to-end package purchase launch.

## Implementation

The additive `20261012080000_add_package_credit_grants` migration records immutable issuance per purchase and service, with the purchased quantity and first grant timestamp. Ownership follows the immutable purchase's parent, not a selected child. Mixed-service packages retain separate service quantities; they are not converted into interchangeable sessions. No existing payment is backfilled into a grant.

After current checkout, intent, captured charge, destination transfer, fee and dispute/refund evidence verifies, settlement records grants in the same database transaction. Purchase locking and the composite primary key make repeated/concurrent delivery idempotent. SQL checks require clean verified payment and exact immutable service quantities. Updates and independent deletion of issuance history are rejected; owned disposable purchase cleanup cascades normally.

Settlement takes ordered participant locks, checks current account roles/deletion, trainer approval/activity and the purchased services, and holds issuance for unavailable fulfillment. Financial review, pending/failed/completed refunds or failed provider reads do not issue new grants. Later review preserves existing issuance history rather than erasing it. A clean simulated receipt can recover without duplicate issuance; this does not claim that a real dispute or reversal can be administratively erased.

Scoped parent/trainer history now exposes `creditsGranted` and a `Credits recorded` value, while retaining `Session credits unavailable`. This number is issuance history, not a spendable balance. No booking, trainer wallet credit, additional charge, transfer or payout is created. `grantedAt` is not an inferred payment capture or expiry-start timestamp. No expiry/restoration policy has been invented.

## Verification

| Exact Steps | Expected Result | Actual Result |
| --- | --- | --- |
| Settle one purchase concurrently three times, then replay | One original grant per service; stable timestamps | PASS, focused SQL |
| Create two children for the purchasing parent | Credit ownership remains the parent purchase, no child allocation | PASS, focused SQL |
| Settle a package containing two sessions of one service and one of another | Two distinct grants with quantities 2 and 1 | PASS, focused SQL |
| Close/change role of either participant, deactivate/unapprove trainer or change/deactivate service/sport after opening checkout | Capture recorded for reconciliation; review stored; no grant | PASS, nine focused SQL cases |
| Supply dispute, reversal, fee refund or pending refund | No new credits | PASS, four focused SQL cases |
| Add review after a clean grant, then replay a clean synthetic receipt | Original grant history and timestamps unchanged | PASS, focused SQL |
| Fail provider transfer read | Entire settlement rolls back; no grant | PASS, focused SQL |
| Try SQL quantity rewrite, unrelated service insertion or independent grant deletion | Reject mutations | PASS, focused SQL |
| Insert a grant from only a legacy SUCCEEDED label | Reject unverified grant; history reports zero | PASS, focused SQL |

- Focused package SQL: **181 passed**, 42.86s, start 07:36:04 UTC, exit 0; `.postgres-test/package-credits-focused-sql.log`.
- Full SQL: **646 passed / 14 files**, 250.00s, start 07:37:19 UTC, exit 0; `.postgres-test/package-credits-full-sql.log`.
- First migration command included an additional embedded full SQL run. Fresh deployment, all 18 checksums, schema parity and replay passed, but the embedded process exceeded its unchanged 180-second limit under concurrent workload. Exit 1 (`ETIMEDOUT`); owned rehearsal database removed. `.postgres-test/package-credits-migrations.log`. This is not recorded as a passing fresh-schema SQL run.
- Separate migration-only rerun: fresh, legacy and phone-history modes all PASS; all 18 checksums and five SQL-only triggers verified, schema parity and no-op replay passed, all 12 historical tables preserved and three owned temporary databases removed. Exit 0; `.postgres-test/package-credits-migrations-retest.log`. Full SQL coverage is from the separately applied 18-migration loopback database above.
- Initial quality gate: lint zero errors / 42 warnings, TypeScript and **1,402 units / 64 files** passed (33.91s, 07:41:36 UTC), then Prisma generation failed with Windows DLL rename `EPERM` while the migration client was live. `.postgres-test/package-credits-check.log`, exit 1. All SQL/rehearsal processes were allowed to finish before a serial full-gate retry; no checks or timeouts were relaxed.
- Independent guard inspection confirmed the owned disposable database and zero users/bookings/payments/purchases/credit grants/wallet entries; local PostgreSQL stopped before the serial build retry.
- Final post-race SQL: **648 passed / 14 files**, 164.07s, start 07:48:11 UTC, exit 0; `.postgres-test/package-credits-final-sql.log`. Independent cleanup confirmed zero users/bookings/purchases/grants before stopping the owned database.
- Migration working/staged SHA-256: `699a05d2f86774d2966654f1304bfa46d8ca891d51d8a01368d5273006224ab9`; migration is unchanged after application.
- Final serial `npm run check`: PASS, exit 0; lint zero errors / 42 existing warnings, TypeScript, **1,402 units / 64 files** (42.34s, start 07:54:10 UTC), Prisma generation and optimized Next build passed. Compilation 30.9s, build TypeScript 26.0s; `.postgres-test/package-credits-final-check.log`. Focused browser-spec lint and `git diff --check` also passed.
- Browser regression: **36 passed**, 4.3m, exit 0, completed by 08:02 UTC. Command: `playwright test e2e/package-history-local-regression.spec.ts e2e/trainer-packages-local-regression.spec.ts --project=chromium --workers=1`; `.postgres-test/package-credits-browser.log`. All 24 parent/trainer history cases and 12 trainer package-management cases passed at 1440px/390px, including refresh/reload, uncertain responses, list failure and parent denial. Success/lost-response reloads retained two recorded credits; other cases retained zero. No unexpected page errors or horizontal overflow.
- Post-browser independent SQL guard and counts: owned disposable database confirmed; users, bookings, payments, purchases, grants and wallet entries all zero. Owned app port 3108 and PostgreSQL port 55439 stopped after tests.
- Source publication and hosted evidence follow below. Unexecuted gates are not passes.

### Eligibility Race Reproduction

Before publication, two additional tests paused destination-transfer verification and tried to deactivate the purchased sport or service through an independent transaction. Expected: the mutation waits until settlement releases its eligibility locks. Actual: both edits committed before grant issuance. **Two failed / 181 skipped**, 5.38s, 07:47:20 UTC; `.postgres-test/package-credits-race-baseline.log`. Severity P1 for issuance eligibility integrity.

Added ordered service and sport read locks before reading fulfillment state. Focused retest: **two passed / 181 skipped**, 3.25s, 07:47:51 UTC; `.postgres-test/package-credits-race-retest.log`. The independent edits hit the test's lock timeout while receipt verification was paused; settlement then completed normally. Full SQL and quality gate are rerun after this source fix. The preceding serial full gate had passed, but is not used as build proof for the later locking edit.

## Visual Evidence

Inspected full-page success-state captures at 1440px and 390px. Long titles and synthetic account emails wrap without overlap; both roles show two recorded credits and retain the unavailable-for-use warning. Only trainers see the original trainer allocation and payout-status link. These screens use synthetic local fixtures, not hosted purchases.

- [Parent desktop](evidence/package-credits/parent-desktop.png)
- [Parent mobile](evidence/package-credits/parent-mobile.png)
- [Trainer desktop](evidence/package-credits/trainer-desktop.png)
- [Trainer mobile](evidence/package-credits/trainer-mobile.png)

## Remaining Release Gates

Implement atomic owned-child redemption, balance/expiry enforcement and policy-snapshot-backed restoration, then expose accessible package purchase and booking controls. Obtain actual hosted trainer login/Connect readiness, customer sandbox checkout, valid webhook receipt, destination transfer and payout proof. Account-closure checkout-link retirement and other previously documented financial/security gates remain open. Overall production and money-flow signoff: **HOLD**.

## Published Source And Hosted Retest

- Source commit: `61f30d880f0b554d6e1700d57f2a793d4bb134b1`, pushed to `codex/payment-readiness-20261006`. No main/Production/Story update.
- Vercel deployment [`GpwohgBdbp98ZChWRvbTveMEArtH`](https://vercel.com/styleres-projects/trainr/GpwohgBdbp98ZChWRvbTveMEArtH): Ready, Latest, Preview, 57s; completion 2026-10-12 **08:04:57 UTC**. Source link matches `61f30d8`. Unique URL: `https://trainr-e4959vxct-styleres-projects.vercel.app`; stable audit branch alias unchanged.
- Expanded build logs and searched staging: **Audit staging schema upgraded; migration checksums verified.** This is the guarded audit Preview upgrade, not a Production migration.
- Anonymous hosted checks **08:05:29-32 UTC**, all ten PASS: GET health 200 with `dbConnected=true`; GET bookings, trainer packages, trainer wallet and package purchases 401; POST admin refunds and package refresh 401; unsigned POST payments webhook 400; PATCH nonexistent booking and admin bookings 401. Empty unauthenticated mutation bodies only; no financial signature, session or real transaction. Evidence: `.postgres-test/package-credits-source-hosted-smoke.json`.
- Authenticated parent dashboard reload was **not executed**: browser approval service returned a temporary HTTP 429/retry-limit failure. No workaround was attempted. Read-only retry approval requested from owner. Prior parent persistence evidence is not reused as a pass for this deployment; saved-athlete/history/role browser retest remains pending.
- Fresh GitHub [run 38221331032](https://github.com/StylereTech/trainr/actions/runs/38221331032) confirms both `check` and `migrations` were **not started because the account is locked due to a billing issue**. Job IDs 114718035918 and 114718035687. This is an external pre-execution CI block, not a failing executed test or green CI result. Billing settings unchanged.
