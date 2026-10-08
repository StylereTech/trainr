# Account Token Security Audit

## Identity And Scope

- Date/time: 2026-10-08 UTC, implementation and focused verification 15:35-15:42. Final results and publication follow below.
- Baseline commit: `f2c9fff915e586b9b13c638691e6ce985fa31d80`, branch `codex/payment-readiness-20261006`; working tree was clean. Previous goal turn published booking-retry fixes and evidence, so it made concrete progress.
- Environment: local production build, guarded disposable PostgreSQL `trainr_audit_20261008` at loopback port 55439. Accounts use `registration-<UUID>@example.test`, `session-<UUID>@example.test` and `browser-registration-<UUID>@example.test`; no customer/demo credentials.
- Finding P1: verification and password-reset bearer tokens were stored directly in `users`. A database disclosure could expose usable account links before expiry. Existing single-use SQL predicates and session revocation were retained.
- Status: local hardening in progress; full production and money-flow signoff remains **HOLD**. No real Stripe/email delivery, production migration or main promotion is established by this report.

## Implementation

- Persist a domain/purpose-separated SHA-256 digest in the existing token columns, with the explicit `sha256:v1:` format. Redemption hashes the supplied token and uses only that digest in both lookup and the atomic conditional update; no legacy plaintext fallback exists.
- For bounded resend recovery, persist a random 32-byte seed and derive the emailed 256-bit value using Node's HMAC-SHA256 with the server-only `NEXTAUTH_SECRET`, user ID, purpose and a versioned context. Neither the seed nor the digest is redeemable. A database-only disclosure does not provide the derivation key. Server-secret compromise remains a separate threat, not solved by this change.
- Existing user-row serialization, 15-minute resend identity window, 24-hour verification lifetime and one-hour reset lifetime remain. Changed/invalid stored state or a changed server key causes a new token/seed/digest on the next request. Missing or shorter-than-32-byte configuration fails closed without transmitting email; byte length does not establish secret entropy.
- Registering an account no longer writes a raw token. The post-commit email preparation creates protected state under the account lock; failure retains the account and reports email unavailable. Email retry still uses a stable provider idempotency key for the same payload.
- Successful verification/reset clears both digest and seed. Account closure also clears them. Public/admin session projections do not add either field. Password reset still increments session version exactly once.
- Reference: [OWASP recovery guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) requires secure token storage, expiration and one-time use. This report does not equate those checks with a complete authentication review.

## Exact Verification

| Route / Surface | Steps | Expected / Actual |
| --- | --- | --- |
| Token helper and Resend adapter | Generate/rederive with same seed; vary user, purpose, seed and key; try short/missing key and invalid seed | 22 focused unit tests passed in 548ms, including existing provider destination/timeout/error checks. Different contexts produce different tokens; stored digest/seed are not the bearer. |
| `POST /api/auth/register` | Register parent/trainer, inspect actual SQL row and intercepted SDK email payload, sign in | Both roles persist and authenticate; database contains digest/seed but not emailed token. PASS focused SQL. Email HTTP is simulated, not delivered. |
| `GET/POST /api/auth/verify` | GET with token; concurrent POST of emailed token; repeat/expire/deactivate | GET does not consume. Exactly one concurrent POST succeeds; replay/expiry/deactivation fail. PASS focused SQL. |
| `POST /api/auth/verification-email` | Authenticated resend; concurrent recent requests; later request; changed server key | Recent same-purpose retries retain one provider identity. Later/key-changed requests supersede prior links. Stale session fails. PASS focused SQL. |
| `POST /api/auth/forgot-password`, `/api/auth/reset-password` | Recover with intercepted emailed token; redeem twice/concurrently; try seed, digest, wrong purpose and legacy plaintext values | Only correct unexpired token changes password. Old cookie revoked; new credentials work. Stored values/cross-purpose/legacy raw rows are rejected. PASS focused SQL. |
| Missing derivation key | Remove local key then request resend | No provider call or replacement of pending digest; explicit internal failure. PASS focused SQL. |
| `DELETE /api/account` | Create pending verification/reset state, close account, inspect SQL | Digest/seed pairs cleared and previous access revoked. Full-suite retest below includes this added assertion. |

Focused SQL: **32 tests / 2 files passed in 13.39 seconds**. Intentional unique/CHECK failures exercise rollback; they are expected, not production incidents.

## Migration And Runbook

1. Rehearse `20261008170000_protect_account_tokens/migration.sql` with the complete audit migration chain on isolated staging. It adds two seed columns and digest lookup indexes and clears existing pending links. Users with old links must request replacements; passwords, roles, email verification state and session versions are not changed by this migration.
2. Local rehearsal used psql `-X -v ON_ERROR_STOP=1 -1`, checked exact database name and guard marker, required zero users and confirmed the columns were absent. Inserted one synthetic legacy token row, applied the exact migration file, asserted both tokens/expiries/seeds were null while password and session version 7 were unchanged, then deleted that exact fixture. Result: PASS, DELETE 1, committed locally only.
3. Coordinate deployment and drain old account endpoints during migration; mixed old/new application versions are not supported. Review backups, schema drift, locks/index build cost and rollback before production. Never restore old bearer tokens as a rollback shortcut. Restart/reissue links under the approved version.
4. Keep a strong random server-only `NEXTAUTH_SECRET` consistent across serving instances. A valid key of at least 32 bytes is required to prepare new links. Do not copy production secrets into preview/test, print the key, or derive user links in operational logs. Key rotation also affects sessions; old digest-backed links remain valid until consumed/expired or replaced, unless explicitly invalidated as part of a rotation response.
5. SQL integration reads tokens from intercepted email payloads. Browser tests use the synthetic local seed plus local test secret to reconstruct the link; that tests HTTP/SQL redemption, not email delivery. Provider credentials are empty in the browser server.
6. Expired-state retention cleanup, distributed rate limits, timing-based account enumeration, verification gates, consent/privacy policies and external delivery remain open. Staging/project selection, migration-chain rehearsal, GitHub billing and actual Stripe Checkout/Connect/transfer/refund/payout proofs remain release blockers.

## Final Retest And Publication

- `npm run check` exited 0: lint with existing warnings, typecheck, **745 unit tests / 40 files in 9.96 seconds**, Prisma generation and optimized Next build (compile 28.9 seconds). Unit execution began 2026-10-08 15:41:18 UTC. No font mocks or TLS bypass were used.
- Full guarded SQL run began 15:43:31 UTC: **203 tests / 8 files passed in 42.97 seconds**, including the final account-closure seed-clearing assertion. Expected injected constraints remain explicit rollback evidence.
- Built-app account browser checks: **5 registration cases passed in 40.0 seconds** and **5 session cases passed in 21.7 seconds**, on desktop/mobile. Verification persists after refresh, reset invalidates the old cookie, and token seeds are cleared after consumption. The previous turn's registration connection reset did not recur in this run; its root cause remains unproven, not declared fixed by token hashing.
- Visually inspected retained synthetic evidence: [desktop verification](evidence/account-tokens-20261008/desktop-verification.png), [mobile verification](evidence/account-tokens-20261008/mobile-verification.png). No token is displayed. The tests also assert image loading and no horizontal overflow.
- Complete built-app browser regression: **74 tests / 16 files passed**, run sequentially with one fresh browser per file to limit system-drive use. Completed by **2026-10-08 15:52:27 UTC**; orchestrator exit 0, `FILES_RUN=16`, `FAILED_FILES=` empty. No skips, assertion weakening, extended timeouts or retries. Covers registration/session, admin, athletes, booking/retry/cancellation, trainer catalog/certifications, Connect status, dashboards, fees, public profiles, refund display and trainer approval/profile editing.
- Final SQL guard inspection at 15:52:27 UTC confirmed the disposable database identity and **zero** users, athletes, athlete request records, booking request records, bookings, payments, Connect attempts, admin actions and notifications. Token state was cleared with synthetic user cleanup. The local Next server and disposable PostgreSQL were then stopped.
- Push and read-only live results follow after actual completion. No production claim is implied by the local checks.
