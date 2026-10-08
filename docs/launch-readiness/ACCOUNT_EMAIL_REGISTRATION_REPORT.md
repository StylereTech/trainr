# Account Registration And Email Delivery Audit

## Identity And Scope

- Date: 2026-10-08 UTC. Baseline `8652e4c50674ec461eecfe6e7e3e1550651529b6`, audit branch `codex/payment-readiness-20261006`; final publication proof below.
- Environment: local audit checkout, guarded disposable PostgreSQL `trainr_audit_20261008` on loopback port 55439, synthetic accounts. Resend requests intercepted in tests; no real email, Stripe transaction or production database write.
- Accounts: generated `registration-<UUID>-<sequence>@example.test` parent/trainer/admin fixtures; browser accounts use `browser-registration-<UUID>@example.test`. Local-only random passwords/session secret. No production/demo account used.
- Overall **HOLD**. This work fixes account creation and adds real provider-call code, not verified production email delivery, mandatory verification enforcement, or live financial settlement.

## Confirmed Findings And Changes

| Severity | Finding | Fix / Status |
| --- | --- | --- |
| P1 | Registration and recovery generated tokens but both email calls were TODOs; success copy falsely implied delivery | Added bounded Resend SDK calls, stable provider idempotency keys, trusted configured callback origins, accepted/unavailable states and authenticated retry. Provider acceptance is not inbox delivery. |
| P1 | Trainer registration could persist the account, then fail notification and return 500 | User/profile/admin notifications now commit in one transaction; real constraint-failure test proves rollback and clean retry. |
| P1 | Verification GET consumed a token and update did not recheck token/expiry/deactivation atomically | GET now reads only the current authenticated account's status. Explicit POST consumes the token once with conditional update. Link previews do not verify an address. |
| P2 | Concurrent registration could surface 500, or same-named trainers could share timestamp slugs | Unique-email race returns 409; trainer slug suffix uses random UUID. |
| P2 | Signup/recovery email normalization differed from login | Trim/lowercase consistently; malformed credential types fail closed. |
| P2 | Registration ignored terms consent and allowed passwords beyond bcrypt's 72-byte input bound | Server requires affirmative consent; registration/reset reject oversized UTF-8 passwords. This is not durable versioned legal-consent evidence. |
| P2 | Shared auth layout redirected signed-in users away from recovery links | Authentication redirect now belongs only to sign-in/sign-up server wrappers; recovery remains accessible. Existing client form markup is moved, not redesigned. |
| P2 | No retryable verification screen, uncertain signup errors encouraged another registration | Added `/account/verify-email`, account-settings link, explicit confirmation, current-status refresh, failure states and token removal from the URL after success. Signup uncertainty points users to sign in before creating another account. |
| P2 | Development recovery logs exposed bearer tokens | Removed token/email-link logging; provider error bodies are not passed to responses/logs by the new delivery helper. Token-bearing pages use no-referrer metadata. |

Email retries within fifteen minutes reuse the persisted token and exact request identity. A later explicit request rotates the token; the superseded link is invalid. Verification expires after 24 hours and recovery after one hour. There is no unattended retry worker or delivery-webhook reconciliation in this pass. A failed/ambiguous provider attempt is never reported as delivered. [Resend idempotency behavior](https://resend.com/changelog/idempotency-keys) and the installed SDK implementation informed the request wrapper; tests verify its forwarded abort signal, redirect policy, endpoint and headers.

## Routes And Exact Checks

| Route / Surface | Steps | Expected / Actual Evidence |
| --- | --- | --- |
| POST `/api/auth/register` | Submit parent/trainer payload with consent, normalized email and valid password; read real user/profile; authorize credentials | 201, persisted role/profile, accepted provider state only for a valid mock response; no hash/token in JSON; credential login succeeds. PASS SQL. |
| POST `/api/auth/register` concurrency | Submit same normalized email twice concurrently, then two same-named trainers with different emails | One 201 plus one 409; one user. Different trainers get distinct slugs. PASS SQL. |
| Registration rollback | Add disposable notification CHECK failure, register trainer, inspect absence, remove test constraint and retry | No partial account or email attempt; retry succeeds and one admin notice persists. PASS SQL. |
| Registration validation | Reject missing consent, ADMIN role, blank name, ASCII and multibyte overlong passwords | 400, no account/provider request. PASS SQL. |
| GET `/api/auth/verify` | Visit with token while anonymous, then inspect user; authenticated GET after confirmation | Anonymous 401 without consumption; authenticated response only verified boolean/current role. PASS SQL. |
| POST `/api/auth/verify` | Race two POSTs; repeat; try expired and deactivated tokens | Exactly one success; invalid/expired/deactivated rejected. PASS SQL. |
| POST `/api/auth/verification-email` | Anonymous request, authenticated trainer request, then revoked cookie | 401, accepted attempt only to the account's own email, then 401. PASS SQL. |
| POST `/api/auth/forgot-password` | Missing, active, deactivated and provider-failed accounts | Same generic response body; no claim of delivered mail, no send for deleted/missing account. PASS SQL. Timing/rate-limit concerns remain below. |
| POST `/api/auth/reset-password` | Extract token from simulated provider payload; reset once; retry and use old session | Password changes, token cleared, old session rejected, second reset rejected, new credentials authenticate. PASS SQL. |
| Resend adapter | Test real installed SDK with intercepted fetch: valid/malformed/error responses, transport failure, bad configuration, unsafe URL/provider override, stable repeated key | Fourteen focused unit cases passed; no real provider request. |
| Browser signup/verification/recovery | Parent and trainer at 1440px and 390px, actual signup/login/status/verification/reset APIs and disposable DB; provider accepted UI state separately simulated | Final browser results below; do not infer from SQL tests. |

## Verification Commands And Failures

- `npx vitest run tests/account-email.test.ts`: **14/14 passed** using simulated provider responses. Initial typecheck passed.
- `npx vitest run --config vitest.postgres.config.ts tests/integration/account-registration.integration.ts`: **18/18 passed** in 8.47 seconds. The first launch was not executed because permission review timed out; one retry succeeded. Intentional uniqueness/constraint failures are rollback-test evidence, not production records.
- Two network-enabled `npm run check` launches did not execute because permission review timed out. A sandbox `npm run check` passed lint (existing warnings) and typecheck, then failed at Vitest's config bundler reading outside the workspace. This combined command is not recorded as passed.
- The supported runner config loader initially exposed CommonJS `__dirname`. Both Vitest configs now resolve their source alias using `fileURLToPath(new URL(..., import.meta.url))`. No assertion, test selection or timeout was weakened. `npx vitest run --configLoader runner`: **678 tests / 37 files passed** in 7.95 seconds.
- With `TEST_DATABASE_URL` set to the guarded loopback database and `TRAINR_ALLOW_DB_TESTS=1`, `npx vitest run --config vitest.postgres.config.ts --configLoader runner`: **152 tests / 6 files passed** in 22.65 seconds.
- Sandbox build failed on an inferred workspace root outside the repository plus font access. Explicit `outputFileTracingRoot: __dirname` removed the unrelated parent-root failure; the next build isolated a Google Fonts access-denied failure. Network-enabled retry subsequently failed with ENOSPC while writing generated Webpack cache. These failures are not source/test passes.
- Disk filled enough to prevent a new terminal helper from starting. The Node tool verified the real path of this checkout's `.next/cache`, removed only that disposable directory, and measured **269,684,736 bytes** available afterwards. No source, database or unrelated directory was removed.
- Added opt-in `TRAINR_DISABLE_BUILD_CACHE=1` to prevent another local disk-cache exhaustion. Normal builds retain caching. Final build uses that flag and `NODE_OPTIONS=--dns-result-order=ipv4first`; final results below. No TLS verification bypass or mocked font was used.

## Remaining Gates

- Production currently lacks a listed Resend API key in the inspected project settings. Owner must configure a verified sender/domain, credentials and isolated staging delivery. Actual inbox arrival, bounce/spam handling and provider logs are NOT verified. Do not paste keys or send test messages to real customer addresses.
- Existing token columns still hold bearer tokens. Hash/protect token storage, review retention and legacy-link migration, and audit broader credential diagnostics before final security signoff. This pass removes explicit development token logging, not every possible diagnostic leak.
- Current policy still permits login and booking before email verification. No silent legacy-account lockout was introduced. Verification gating and migration policy need a deliberate product/security decision.
- Rate limiting remains process-local and uses request IP headers; serverless-wide abuse protection and account-enumeration timing require further work. Same response body alone does not prove enumeration resistance.
- Parent first/last names are not represented in the existing parent model; legal-consent version/time is not persisted. Child-profile API still needs strict date/catalog validation, complete editing/deletion behavior and role-scoped persistence tests. These were identified, not fixed or signed off in this pass.
- Existing booking timing/expiry, cancellation/refund execution, retention/security, migration/staging rollout, hosted CI billing and actual Stripe checkout/Connect/transfer/payout gates remain open. Main and production must not be promoted on this local evidence alone.

## Final Retest And Publication

- Network-enabled no-cache build passed, compiled in **22.7 seconds**, with lint/type validation and page generation completed. The build used the actual configured Inter font, not a mock or a TLS bypass.
- Initial four browser cases failed on an overly broad test selector matching both the page alert and Next's route announcer. Scoped the locator to `main` without changing the required error text or timeout.
- Next focused run passed three cases and failed the fourth because direct test API requests did not inherit page-only headers and shared the recovery throttle. Scoped API fixture headers to the same synthetic client identity as each page. The app throttle was not changed. Failure evidence retained under ignored `e2e-report/registration-fixture-failure-20261008/`.
- Corrected focused browser run: **4/4 passed in 42.5 seconds**. Both parent/trainer roles at 1440px/390px actually register, log in, remain unverified after provider acceptance, explicitly verify, persist verification after reload, visit the correct dashboard, reset passwords while already signed in and reject the old session afterwards. No real email was sent. Local app explicitly has empty Resend credentials.
- Inspected `verification-unavailable.png` at 390px and `verification-persisted.png` at 1440px: logo loaded, text/actions readable, no horizontal overflow. Existing signup toast temporarily covers mobile navigation. These images do not establish whole-site accessibility or visual signoff.
- Final broader gate and publication follow below. A small metadata correction removes the duplicated product suffix observed in Next's route announcer; final build retests the corrected source.
- Before the full browser matrix, the normal `npm run check` completed successfully: lint with existing warnings, typecheck, 678 unit tests and production build (24.2-second compilation).
- The subsequent full browser matrix had **54 passes / 1 failure** in 4.2 minutes. The desktop trainer signup's first-name input was empty after it had been filled; the trace contained no registration request. This is consistent with pre-hydration input loss, not a backend registration failure. Preserved trace/video/context under ignored `e2e-report/registration-hydration-failure-20261008/`. Signup now disables its fieldset until client initialization completes, and during submission. Added a no-JavaScript initial-state regression; the four existing real signup cases still require normal successful interaction. No sleeps, assertion weakening or longer timeouts were added.
- Read-only live smoke at 13:17 UTC: `https://trainr.cc/api/health` returned 200 with `ok:true` and `dbConnected:true`; anonymous `/api/payments/connect`, `/api/trainer/stripe-connect` and `/api/admin/bookings` each returned 401. This is the older production deployment, not evidence that the new account code is live.
- After the initialization fix, `npm run check` passed again: 678 unit tests (8.51 seconds), lint/typecheck and production build (26.8-second compilation). Four real registration/browser cases passed on this build. The new no-JavaScript case initially passed its disabled input assertion but missed the hidden streamed submit button; allowing that static-state locator to include hidden content passed the focused retest (1/1, 3.8 seconds). Normal interactive cases still require visible controls. Failure context/trace retained under ignored `e2e-report/registration-static-selector-failure-20261008/`.
- Final full local browser command `npx playwright test local-regression.spec.ts --project=chromium --workers=1`: **56/56 passed in 3.5 minutes**, including both registration roles at both viewport sizes and the initial-state regression. Completed before 13:26 UTC on the final source tree; only report/publication edits follow.
- At 13:26 UTC, authenticated SQL confirmed the disposable database guard and **zero users, bookings, payments, Connect attempts, admin actions and notifications** after fixture cleanup. The local app and disposable PostgreSQL server were stopped. No production records were changed.

## Publication Proof

- Source/test/report commit **`7808e72c2d9cbf7331ec2da27caa29ca717feb2d`** (`fix: harden account registration and email recovery flows`) was pushed normally to `origin/codex/payment-readiness-20261006`. GitHub branch API returned the same SHA; local working tree was clean before this documentation-only follow-up. Main and production were not promoted.
- GitHub Actions [run 37784504972 / job 113335679272](https://github.com/StylereTech/trainr/actions/runs/37784504972/job/113335679272) concluded failure with **zero executed steps**. Annotation: "The job was not started because your account is locked due to a billing issue." Local passing checks do not imply hosted CI passed.
- The Vercel commit status was pending at the publication check, targeting the preview project `trainr`: [deployment AtQzw1D35PyfQFhYyhNX8dUNh9Mu](https://vercel.com/styleres-projects/trainr/AtQzw1D35PyfQFhYyhNX8dUNh9Mu). A successful Preview Comments check is not deployment or application validation. Earlier inspected preview environment lacked required service configuration; no authenticated staging/email/payment proof is claimed.
- Post-push read-only live smoke at **2026-10-08 13:28:24 UTC**: `/api/health` 200, `ok:true`, `dbConnected:true`; `/api/payments/connect`, `/api/trainer/stripe-connect`, `/api/admin/bookings` each 401 anonymously. The existing production deployment remains separate from this audit branch. Account-email changes are **not verified live**.
- Outcome: local quality, real disposable SQL persistence, browser regression and branch publication passed. Final production and money-flow signoff remain **HOLD** for the open gates above.
