# Booking Retry Integrity Audit

## Identity And Scope

- Date/time: 2026-10-08 UTC; focused SQL retest 15:03, quality gate 15:05-15:07, full SQL 15:06-15:07. Final browser/publication timestamps follow below.
- Baseline: `0885c90500f012529be0b0d84a7ad8beb5d3d9ec`, branch `codex/payment-readiness-20261006`. Working tree was clean at the start of this pass. Previous pass made concrete progress by publishing athlete CRUD and its verification evidence.
- Environment: local optimized Next build on `http://127.0.0.1:3107`, guarded disposable PostgreSQL `trainr_audit_20261008` on loopback port 55439. No customer account, production booking, charge, refund, transfer or payout was changed.
- Accounts: generated `reservation-<UUID>@example.test` parents, `reservation-trainer-<UUID>@example.test` trainers, and `browser-<UUID>@example.test` browser fixtures. API tests use real encrypted local cookies and current SQL identity; no production/demo credentials.
- Status: local reservation retry improvements only; overall production and money-flow readiness **HOLD**. Trainer timezone/past-start rules, package entitlements, hold expiry and live Stripe proof remain unresolved.

## Findings And Fixes

- P1: POST booking creation had no durable retry identity. After a lost response the parent could not recover the saved booking through the original request; overlap detection merely rejected many retries and did not establish request identity after cancellation or other state changes.
- New `BookingCreateRequest` records a parent-scoped UUID, normalized payload hash and saved booking identity in the same transaction as the booking, coupon usage, optional zero-due payment and trainer notice. Same-key concurrent requests return the same booking; changed payloads conflict. The API deliberately retains HTTP 201 on successful replay, returning the existing booking's current state, not a new reservation.
- P1: creation trusted the role checked before the transaction. It now locks the current user, rechecks active PARENT identity and serializes parent requests with `FOR NO KEY UPDATE` before existing trainer/service/athlete locks. Athlete deletion races were rerun against this ordering.
- Replays do not recalculate price, re-consume coupons, create another notification/payment or reopen a cancelled booking. A nullable booking reference retains a tombstone if a booking is physically removed, so a delayed replay cannot recreate it. The application does not add a financial-record deletion feature.
- Browser form creates one request UUID, holds its exact body during uncertain responses, disables editable fields and exposes Retry same reservation plus a dashboard link. A synchronous in-flight guard prevents repeated clicks. Booking/checkout calls have 15-second timeouts. Malformed success bodies are treated as uncertain, not as saved booking proof or permission to start checkout.
- Only an explicit 400 releases the request for corrected input. Authentication/ownership/conflict responses require dashboard review; network/5xx outcomes preserve the same request. Cancelled/completed/no-show/rescheduled recoveries navigate to the dashboard without requesting checkout. Zero-due confirmation also skips checkout.
- Removed the inaccurate booking-page claim "No charge until confirmation"; copy now identifies Stripe checkout as the collection point. Surrounding legacy design commentary/media placeholders are still an open UI issue, not signed off by this change.

## Exact Verification

| Routes / Surface | Steps | Expected And Actual |
| --- | --- | --- |
| `POST /api/bookings` | Two concurrent identical authenticated requests with coupon; inspect independent SQL connection | Same ID and HTTP 201 twice, one booking/request/notice, one coupon use, private no-store response without request hash/key. PASS SQL. |
| Same endpoint | Reuse key with changed notes, time, athlete ID or coupon | 409; one unchanged booking and one coupon use. PASS SQL. |
| Same endpoint after cancellation | Create, cancel in SQL, archive/reprice service and deactivate trainer, replay original request | Return original cancelled booking at its original total, no new booking/notice. PASS SQL. This is retrieval, not permission to pay an ineligible trainer. |
| Same endpoint after removal | Remove the synthetic booking, replay original key | Ledger reference becomes null, replay 409, no resurrection. PASS SQL. |
| Zero-due reservation | Apply 100% coupon, replay | One CONFIRMED booking, one zero-amount SUCCEEDED payment and one notice. PASS SQL; no Stripe charge/payout is implied. |
| Parent isolation | Use same UUID for a different parent's own athlete in another time slot | Separate owned booking, no cross-parent recovery/disclosure. PASS SQL. |
| Transaction identity | Create then change parent to TRAINER/ADMIN or deactivate; call creation/replay helper | 403 under transaction identity check, existing booking unchanged. PASS SQL. API role/auth gates and malformed UUID rejection passed focused unit tests. |
| Rollback | Add temporary rejecting ledger CHECK constraint; create free reservation with coupon; inspect all tables, remove constraint, retry | First 503 with zero booking/payment/request/notice and no coupon use; retry commits once. PASS SQL. |
| `/book/[slug]`, `/parent/dashboard` | At 1440x900 and 390x900, commit actual HTTP/SQL booking then drop/malformed response, cancel before replay or use free coupon | PASS 8/8 focused browser cases: exact retry body, one reservation/request/coupon use, disabled inputs on uncertainty, persisted state after refresh. Cancelled/free recoveries made zero checkout calls; pending recoveries made one simulated failed checkout call and retained their unpaid booking. No real Stripe request sent. |

## Failure And Retest Record

1. Focused unit gate: **94 tests / 4 files passed** in 2.33 seconds. Validation fixtures now include request UUIDs so invalid-date tests continue testing dates, not merely failing a new required field.
2. First focused SQL run: 28 athlete tests passed; 13 new reservation tests failed during fixture setup because the synthetic coupon omitted required `createdById`. Added that fixture field and ensured failed setup cannot invoke coupon cleanup with an undefined ID. No production code/assertion was weakened. Corrected retest: **41/41 passed** in 5.07 seconds (13 booking-request + 28 athlete tests).
3. `npm run check` exited 0: lint with existing warnings, typecheck, **737 unit tests / 39 files in 8.68 seconds**, Prisma generation and optimized production build (compile 32.1 seconds). Fonts were downloaded normally; no TLS bypass or mock-font build.
4. Full guarded SQL suite: **199 tests / 8 files passed in 31.03 seconds**. Injected CHECK failures are intentional rollback evidence. Older Stripe/email suites simulate provider methods; no live-provider success is claimed.
5. Focused desktop/mobile browser suite: **8/8 passed in 52.7 seconds**, real HTTP/SQL creation with simulated failed checkout. No skips, timeout increases or retry-based test masking. The full local browser suite is run as separate sequential files using a fresh browser per file to avoid the previously documented system-drive exhaustion.
6. Visual review after the initial focused pass found poor contrast in the disabled athlete picker and contextual fields. The first broader run was deliberately stopped during the Connect file, not counted as a complete pass. Added scoped light surfaces/dark text and full opacity for disabled booking inputs plus exact CSS assertions at both viewports. Final rebuild/retest results are recorded below; prior screenshots are not the final visual proof.

## Migration And Operations

1. Apply/rehearse `20261008160000_add_booking_create_requests/migration.sql` with all earlier audit migrations on isolated staging before deploying this API. This pass authenticated the disposable database/guard marker and confirmed `to_regclass('public.booking_create_requests')` was null, then applied this exact SQL transactionally via psql `-X -v ON_ERROR_STOP=1 -1 -f`. CREATE TABLE/INDEX succeeded locally only.
2. Production migration-chain baseline, drift, backup/restore rehearsal and correct project selection remain release gates. Do not run an unreviewed reset, `db push`, or migration against production to make a preview green.
3. Booking POST now requires UUID `requestId`. The repository booking UI and direct helper callers are updated. Old cached/custom clients must refresh/update. The same key must identify the same normalized booking payload; never generate a replacement key merely because the response was lost.
4. Creation retries return current saved booking state with HTTP 201. They do not guarantee an unpaid Checkout Session, available funds, trainer receipt or a payout. Checkout separately rechecks booking/payment/trainer eligibility and preserves its existing provider identity.
5. In-memory browser retry state does not survive page refresh/navigation/browser closure. After those events, inspect saved bookings first. No cross-navigation draft or retry persistence is claimed. Do not delete request records to bypass conflicts; retention and account-closure lifecycle for linked payload hashes need privacy review.
6. Current coupon policy still consumes usage when the reservation commits, not when payment settles; cancellation does not restore usage in this pass. Pending-hold expiry, session start/timezone validation, package credits and refund policy remain unresolved. No time zone was invented from server/browser defaults.

## Final Retest And Publication

- Final contrast-corrected tree: `npm run check` exited 0, with **737 tests / 39 files in 11.15 seconds**, typecheck, lint (existing warnings), Prisma generation and optimized build (compile 26.3 seconds). Unit run began 2026-10-08 15:14:33 UTC.
- Final guarded SQL rerun began 15:16:08 UTC: **199 tests / 8 files passed in 28.40 seconds**. No production database was contacted.
- Final focused browser rerun: **8/8 passed (1.1 minutes)**, including exact dark foreground, light disabled background and full-opacity assertions for the athlete, notes and coupon controls at both viewports. Desktop/mobile screenshots were inspected; no horizontal overflow. Retained synthetic evidence: [desktop 1440px](evidence/booking-retry-20261008/desktop-1440.png), [mobile 390px](evidence/booking-retry-20261008/mobile-390.png). Legacy hero/media-placeholder layout remains open.
- The interrupted earlier browser run left one synthetic account. Its exact ID/email and lack of bookings were checked before deleting that account in a guarded transaction; DELETE 1, users 0. Final full-suite cleanup is recorded separately below.

- Final sequential broader run exercised **74 tests / 16 files: 73 passed, one failed**. The trainer registration desktop case encountered `apiRequestContext.post: read ECONNRESET` at `/api/auth/forgot-password` before receiving an HTTP result. The server remained running; logs showed only expected unavailable-email notices, no application exception. All other suites passed. The exact cause is not proven, so this is not described as an all-green full run.
- Unchanged registration-only retest: **5/5 passed in 38.4 seconds**, completed by 2026-10-08 15:32 UTC. No assertion, timeout, retry configuration or production code was changed to obtain that result. The intermittent local connection reset remains an observation requiring monitoring, not a proven application fix. Raw local traces contain synthetic session cookies and are intentionally not published.
- Final guarded SQL inspection: database `trainr_audit_20261008`, marker `disposable integration database`; users, athletes, athlete requests, booking requests, bookings, payments, Connect attempts, admin actions and notifications all **0** after browser cleanup.

Publication/live evidence follows after actual push. Main and production are not promoted on local tests alone.
