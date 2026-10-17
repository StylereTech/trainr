# Booking Instants And Checkout Timing

## Scope

- Date: 2026-10-11, work began approximately 08:03 UTC.
- Baseline SHA: `9f03ca6304546f7bdd31941d2f880148b3f0439c`; published implementation SHA: `558d50084b55bb1dd1b43f023a765d92bcded988`. Local and scoped hosted retests completed below.
- Branch: `codex/payment-readiness-20261006`, audit Preview project `trainr`. No main merge, Production (`trainr-node`), Story, Resend or live Stripe changes.
- Local environment: Windows, Node, PostgreSQL 16.15 on loopback port 55439, guarded disposable databases and synthetic `@example.test` accounts. Provider responses in automated tests are simulated, not actual Stripe payments.
- Routes: POST `/api/bookings`, POST `/api/payments/checkout`, GET `/api/dashboard/bookings`, public trainer detail, `/book/[slug]`, parent/trainer dashboards and administrator booking views.

## Findings And Changes

**FAIL / high release risk:** a booking had only a civil date and clock strings. Checkout could be opened for past sessions; overlap checks could miss the same instant on different local dates. Provider Checkout requests had no session-start expiry.

1. Add nullable, immutable booking `timeZone`, `startsAt` and `endsAt`. Legacy rows remain entirely NULL; never infer the original zone from today's trainer profile. SQL rejects partial snapshots and modifications to recorded dates/times/instants, while allowing status updates.
2. Require the request's named time zone to match the trainer's current canonical zone under existing reservation locks. Capture all instants atomically with booking, coupon, notification and idempotency ledger writes. Exact request replay returns the original reservation.
3. Use `@js-temporal/polyfill` 0.5.1 with rejection of ambiguous/nonexistent daylight-saving times. Reject intervals crossing an offset change when elapsed duration differs from the purchased clock duration. Preserve v1 same-day scheduling, including 24:00 ends. See [Temporal disambiguation](https://tc39.es/proposal-temporal/docs/zoneddatetime.html).
4. Query trainer and athlete conflicts by actual instants, with exact service/instant group-capacity matching. Nearby unknown legacy rows conservatively require reconciliation rather than guessing.
5. Reject started reservations, and require a 31-minute safety window for new positive-due reservations/Checkout sessions. Stripe permits `expires_at` between 30 minutes and 24 hours after creation; new requests expire no later than the session start or 23 hours from preparation. See [Stripe Checkout creation](https://docs.stripe.com/api/checkout/sessions/create).
6. Resume an already-known, bounded open Checkout within that window only before the session starts. Withhold unsafe URLs, retain provider identities, attempt expiry, and never claim a refund or invent financial settlement. Do not replace an expired session with recovery enabled.
7. Present the trainer zone on the booking calendar/summary and the saved booking zone on dashboards/admin views. Unknown or started sessions show a payment-blocking explanation. Calendar dates come from the trainer's zone, not the visitor's device.

## Verification Log

| Steps | Expected | Actual / status |
| --- | --- | --- |
| Run focused timing, reservation, route and checkout tests | Correct offsets, reject DST gaps/folds, bounded expiry, rollback and safe provider identity recovery | Initial 191/193 passed; two obsolete fixtures corrected. Later focused 156/156 passed, including recovery-enabled expired-session rejection |
| Run `npm run check` | Lint/typecheck/unit/build pass | PASS, exit 0: 1,120 tests / 54 files, optimized 73-page build. Initial full unit run 1114/1115; old public-schema equality fixture lacked new explicit NULL and was corrected. Existing lint/Browserslist warnings remain |
| Run `npm run test:migrations -- --integration` with guarded TEST_DATABASE_URL and TRAINR_ALLOW_DB_TESTS=1 | Fresh/legacy/phone-history parity, exact checksums, replay no-op, historical rows preserved | PASS, exit 0: all 13 migrations; 330 SQL integration tests / 11 files in 60.29s; all three owned rehearsal databases removed |
| Real SQL update each of date/start/end/zone/start instant/end instant or clear all | Immutable snapshots reject edits; status changes remain possible | PASS, independent client readback; legacy partial snapshot rejected |
| Repeat `postgres-payments.integration.ts` after final recovery-enabled expiry fix | SQL money-state behavior remains intact | PASS, 83/83, 18.78s, exit 0 |
| Reserve UTC Nov 4 09:00, then propose Honolulu Nov 3 23:00 | Detect same instant despite different calendar dates; old booking remains UTC | PASS, only one booking persisted |
| Legacy NULL snapshot / missing or stale trainer zone / past start | No new payment/provider request or invalid reservation | PASS in SQL and route tests |
| Desktop/mobile browser with LA visitor, New York trainer | Correct label, save/refresh original zone after profile changes, clear unknown-time payment error, no overflow | PASS: final 28/28 affected cases in 4.2m, exit 0, no skips/retries/deadline increases |
| Hosted Preview deploy / migration / existing parent smoke | Exact source Ready; parent and athlete preserved; no Production change | PASS within the read-only scope below, 2026-10-11 08:48-08:50 UTC. Actual hosted booking/payment remains unverified |

New migration SHA256: `d517e80c8e4aac917565910ab3768e006f2ba286296c38e37935cc8bf62f3e3f`. Applied to the existing guarded local browser-test database using `prisma migrate deploy`; no reset or schema push. The final gate log is `.postgres-test/booking-instants-final-check.log`; SQL retest log is `.postgres-test/booking-instants-sql.log`. Neither contains provider credentials.

## Browser Failures And Recovery

- First 54-case run: 50 passed, four admin date assertions failed because the expected exact string omitted the newly displayed `Time zone unconfirmed`. Captured DOM showed the correct original dates with the explicit unknown-zone label. Updated the assertions; no date logic was weakened.
- Code review then found parent history omitted the saved clock time and zone. Added both, repeated the entire `npm run check` successfully (1,120 units, 73-page build), and expanded the browser readback to completed history and trainer/public views.
- Expanded 26-case run: 25 passed; the desktop all-in-one journey exceeded its 30-second test deadline during repeated trainer reloads, followed by a teardown foreign-key race. Mobile completed in 28 seconds. The other 24 date/dashboard/trainer-time-zone cases passed, including all four corrected admin cases.
- Split the multi-role journey into separate parent and trainer cases at each width, retaining all assertions and the original 30-second test/10-second assertion deadlines. Cleanup now runs in `afterEach` with exactly the IDs created by that case, before the authentication fixture tears down. Typecheck passed. Independent SQL after the failed run showed users/bookings/sports/coupons all zero; no manual or broad deletion was needed.
- Final split-journey and affected-suite result: **28/28 PASS**, exit 0, 4.2m, completed approximately 08:45 UTC. Earlier 32 booking-retry/checkout-recovery cases all passed, but their Stripe responses/navigation were mocked. A zero-due coupon reservation is not paid Stripe evidence.

## Final Local Retest

Command: `node node_modules/@playwright/test/cli.js test e2e/booking-time-local-regression.spec.ts e2e/booking-date-local-regression.spec.ts e2e/dashboard-local-regression.spec.ts e2e/time-zone-local-regression.spec.ts --project=chromium --workers=1 --reporter=list --output=test-results/booking-instants-verified`, with loopback BASE_URL, matching local-only auth secret, Chrome channel and the guarded disposable TEST_DATABASE_URL. Log: `.postgres-test/booking-instants-verified-browser.log`.

The four split journeys use real local HTTP handlers/SQL: create synthetic parent/trainer/athlete/catalog fixtures; verify booking is disabled without a trainer zone; explicitly set New York; choose the service, athlete, future date, 09:00 and a 100% coupon; submit; independently read the persisted zone/instants, one-hour duration and zero-due payment. Then change the trainer profile to Los Angeles. Parent cases refresh the original New York booking, insert a synthetic legacy NULL-time row to test payment withholding, and set the saved booking to COMPLETED in SQL to test history readback. Trainer cases set COMPLETED in SQL, read/reload the saved New York session, then open public Availability and verify the current Los Angeles schedule zone. This tests completed-history display, not the trainer's completion-action workflow or any real charge.

Additional final cases cover 12 parent/trainer/admin cross-zone date views, 8 dashboard persistence/error cases and 4 trainer zone onboarding/profile cases. [Desktop booking](evidence/booking-instants-20261011/booking-desktop.png), [mobile parent](evidence/booking-instants-20261011/parent-mobile.png) and [mobile trainer](evidence/booking-instants-20261011/trainer-mobile.png) evidence is retained. Labels and recorded times fit the inspected layouts; synthetic long identifiers wrap. This is not a complete site-wide visual signoff.

Independent final psql read: the disposable marker remains present, users=0, bookings=0, payments=0 and sports=0. No hosted parent or trainer data was changed by these fixtures.

## Publication And Hosted Retest

- Source `558d50084b55bb1dd1b43f023a765d92bcded988` committed and pushed to `origin/codex/payment-readiness-20261006`. Local HEAD and remote-tracking branch matched and the worktree was clean at 08:48 UTC. This report's follow-up commit changes documentation only.
- Vercel audit Preview [BJBDaGo9jGWzRZ83Edkfsn5YPeNu](https://vercel.com/styleres-projects/trainr/BJBDaGo9jGWzRZ83Edkfsn5YPeNu) visibly Ready, source 558d500, completed 2026-10-11 01:47:36 PDT (08:47:36 UTC), duration 1m16s.
- Unique deployment: `https://trainr-lm5aar64n-styleres-projects.vercel.app`. Vercel visibly mapped the [stable audit alias](https://trainr-git-codex-payment-readiness-20261006-styleres-projects.vercel.app) to that deployment. Environment was Preview; main and Production were not promoted or changed.
- Expanded build log at 01:46:48.916 PDT: `Audit staging schema upgraded; migration checksums verified.` This is the guarded isolated database initializer's successful upgrade/checksum result, not a manual production schema push. Existing build warnings remain.
- Account: existing owner-signed-in Preview PARENT, identified by its sole synthetic Sandbox Athlete. No password, token, or cookie was copied; no hosted fixture or financial record was written in this retest.

| Exact hosted steps / route | Expected | Actual / status |
| --- | --- | --- |
| Reload `/parent/dashboard` after Ready | Session survives, persisted counts load | PASS: Parent dashboard, 1 athlete, 0 open bookings, 0 reviews |
| Click Past (0) | Correct empty history and pagination | PASS: No past sessions yet; Page 1 of 1 (0 bookings), both paging controls disabled |
| Click Sandbox Athlete, `/parent/athletes/cmv3bs3xr0001jn0694fd2p2f` | Original saved fields survive deploy/migration | PASS: Sandbox Athlete, DOB 2014-01-15, Intermediate, Basketball/Soccer checked, original synthetic goals/notes; no save or deletion performed |
| Follow Browse trainers to `/browse`, then Reset search | Remove default Texas restriction and render catalog | PASS for navigation/filter/empty state: Filters has no count, 0 trainers found, No trainers found and Clear Filters visible |
| Select trainer/service and pay using actual Stripe sandbox | Eligible trainer and completed Connect prerequisite | BLOCKED: unfiltered hosted catalog is empty. No hosted charge, destination transfer, Connect completion or payout is claimed |

Local production test server and the owned loopback PostgreSQL server were stopped after the completed browser/SQL runs. All test processes had returned before publication. Provider-mocked tests and local zero-due reservations do not substitute for actual sandbox money-flow evidence. Fix status: scheduling/checkout-timing implementation published and scoped retests passed; launch status remains HOLD.

## Legacy Operations

Do not bulk backfill NULL snapshots with the trainer's current zone, the server zone or UTC. Obtain evidence of the originally agreed local date/time/zone and record an authorized reconciliation decision before a reviewed one-time repair. A filled snapshot is immutable; any later scheduling change requires a replacement booking, not a direct time update.

Until reconciliation, payment is withheld and nearby reservations involving that trainer or athlete fail safely. Existing paid/refunded history remains visible and webhook settlement evidence remains processable; this is not an automatic cancellation/refund migration. Review any already-issued legacy Checkout and its recovery setting in Stripe before release. Automatic hold expiry, full rescheduling policy and a dedicated audited legacy-reconciliation tool remain open work.

## Release Status

**HOLD.** These tests are not actual provider Checkout, transfer or payout proof. The hosted parent remains signed in with one synthetic athlete and zero bookings; the last verified unfiltered Preview catalog has no eligible trainers. Actual hosted trainer onboarding, approved services, Connect completion and a sandbox booking/payment/destination-transfer/payout still need end-to-end evidence. Programs/purchases/entitlements, pending-hold expiry and Production rollout safeguards remain incomplete. Email setup remains owner-deferred.

Additional observed UI issue, not fixed in this pass: entering a 100% promo code leaves the pre-submit summary showing the original $60 service price until the server creates the zero-due reservation. A server-validated quote/confirmation workflow still needs implementation; do not count coupon-price preview as production ready. The screenshots use synthetic catalog/profile content and are not an audit of every real trainer image or every page.
