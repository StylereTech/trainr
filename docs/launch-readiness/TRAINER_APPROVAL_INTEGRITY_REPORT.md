# Trainer Approval And Checkout Eligibility

- Date/time: 2026-10-08 06:36-06:48 UTC; final build/browser evidence below.
- Source baseline: `4a6f76a6a0996f1911e6e6d5a5d47251cefef964`; revised source is the commit containing this report.
- Environment: Windows, Node 22.23.1, disposable PostgreSQL 16.15, local production build, installed Edge at 1440px/390px. No production writes, account-role changes, screening decisions or financial mutations.
- Accounts: synthetic local administrator, trainer and parent records. Route auth and Stripe are mocked in SQL tests. Browser API/session fixtures are synthetic; they do not prove real login or production persistence.
- Routes: `PATCH /api/admin/trainers/[id]`, `POST /api/payments/checkout`, `/admin/trainers`; related booking creation and checkout helpers with real SQL. Queue reload uses existing `GET /api/admin?view=trainers-pending` and its `updatedAt` field.

## Findings

**High:** trainer approval changed booking eligibility before independently inserting its audit and notification. A later failure could return an error while leaving the trainer approved, and retrying could duplicate side effects. The endpoint lacked strict input/revision validation and trusted an old admin role claim for mutations.

**High:** existing unpaid bookings could start/resume checkout after trainer rejection, suspension or deactivation. Existing reservation creation already rejected these trainer states, but checkout did not.

**Medium:** the approval queue did not recover rejected fetches reliably and could show an empty queue after failed responses. Review actions carried no profile revision, so a decision could apply to content changed after review.

## Fixes

Trainer decisions now lock/check the actual administrator role, lock the trainer row, compare the reviewed revision, then commit eligibility, before/after audit metadata and applicable notification in one transaction. This serializes with existing trainer edits/reservations. Revisions advance monotonically even within one clock millisecond. A stale review returns 409; invalid input returns 400; a database-revoked admin role returns 403. Unexpected persistence failure returns generic 503 without raw diagnostics. Unchanged decisions do not duplicate side effects.

All mutation callers must now send the exact `updatedAt` ISO string as `revision`. `reject`/`suspend` require a trimmed 1-2000 character reason; `feature` and `toggle_active` require explicit boolean desired state. Unknown properties are rejected. The repository's sole UI caller was updated; no silent compatibility fallback permits stale decisions. This uses existing columns and adds no migration.

The queue distinguishes failed loading from empty data, validates a returned review revision, provides Retry/Reload, and disables further writes after stale or uncertain responses until reloaded. Successful decisions reload the queue. Replaced approval-page design commentary with a compact operational heading. Approval messages do not claim completed Stripe setup or background screening.

Checkout rejects ineligible trainers before provider contact. Its transaction also checks current eligibility while holding a shared trainer-row lock. After Stripe responds, eligibility is checked again before returning an open URL. If a trainer becomes ineligible during that provider request, the session ID is committed to the payment and durable attempt before returning conflict, so the provider object is not lost. Authentic later payment evidence can still be recorded; trainer status is not silently restored.

**Important limitation:** this does not expire an already-open Stripe session, reverse funds, cancel existing bookings, or implement the unfinished cancellation/refund workflow. A customer already holding a URL, or an in-flight provider request, can still produce financial activity. Reconciliation is required. Late successful evidence still records the money and can confirm the existing reservation under the current settlement rules; this is not an automatic safety/refund resolution.

## Verification

1. `npx vitest run tests/trainer-admin-actions.test.ts`: **33/33 PASS**. Test approval/audit/notification success; model rollback/retry; competing/stale revisions; malformed JSON, missing/invalid fields and excess properties; absent/non-admin session; database-revoked admin; explicit boolean actions; monotonic revision; generic 503 diagnostics.
2. Expanded focused run: `npx vitest run tests/trainer-admin-actions.test.ts tests/checkout-attempts.test.ts tests/payments-checkout.test.ts`: **93/93 PASS**. Includes all ineligible trainer states, known-session resume denial, and suspension/deactivation during provider response with preserved IDs and no returned URL.
3. Guarded local `npm run test:postgres`: initial **37/37 PASS**, expanded final **40/40 PASS in 3.18 seconds** around 06:46 UTC. Actual Prisma transactions, row locks and constraints; independent client reads. Force real SQL constraints to reject the audit or later notification, then verify approval timestamp/status/revision, audit and notification all rolled back. Remove the test constraint and retry successfully. Competing decisions yield one commit/one conflict. Revoke the actual admin role while session still says ADMIN and verify 403. Suspend/deactivate and verify new reservations/checkouts reject. Change eligibility inside a simulated provider response, verify saved provider identities through an independent client, then apply late payment evidence without restoring trainer eligibility.
4. Cleanup: independently queried users/audit rows/notifications/bookings, all zero; dropped temporary constraints and stopped the disposable PostgreSQL server. No truncation or production database operation.
5. Full static/build gate and desktop/mobile browser retest: final results below. Expected browser behavior: load error is not an empty queue; stale decision disables writes; explicit reload adopts the changed revision; rejection includes a reason and new revision; lost approval response does not trigger an automatic repeat; refresh shows the resulting queue state.

## Deployment And Remaining Gates

Previous commit `4a6f76a` preview is successful at [Vercel deployment FBhiDktRQoc5LMd7E3iDLJNZ3D1x](https://vercel.com/styleres-projects/trainr/FBhiDktRQoc5LMd7E3iDLJNZ3D1x). Its GitHub run `37738283330`, job `113182758427`, executed zero steps: account locked due to a billing issue. Refetched main remains `2067e743c54ffee669cd484f26dc472b157f1881`. Preview project `trainr` is not the separate `trainr-node` production mapping. No live approval/suspension/payment mutation was attempted to test these changes.

The broader session/role revocation audit remains incomplete; the new database-role check is scoped to this mutation, not every admin read/write endpoint. Existing demo privileged credentials, real screening operations, Stripe keys/onboarding/settlement evidence, the checkout migration and correct-project rollout remain release gates. Booking dates still lack a timezone and past-start enforcement; the owner was asked whether to use explicitly selected trainer timezones or platform-wide America/Chicago. No timezone was inferred from the developer machine or silently assigned to historical records.

Read-only live smoke, 2026-10-08: `/api/health` returned HTTP 200, `ok=true`, `dbConnected=true` at `06:51:17.1391846Z`; anonymous `GET /api/admin/trainers/nonexistent-audit-check` returned 401 at `06:51:17.4944809Z`. This proves only those live read/anonymous boundaries on the existing deployment, not the new transaction/checkout code.

Build retest: expanded `npm run check` **PASS, exit 0**, with existing lint warnings, typecheck, **526 unit tests / 29 files**, production compilation and 68 generated pages. Initial four browser cases failed because a broad `getByRole('alert')` also selected Next.js's route announcer. The recorded snapshots showed the intended application alerts. Scoped the assertions by their text; focused browser retest **4/4 PASS in 14.2 seconds**. No application behavior was weakened for these selector fixes. Inspected mobile rejection-dialog and desktop uncertain-response screenshots in ignored `test-results/trainer-approval-local-reg-*/review-decision.png` and `uncertain-decision.png`.

Final full browser retest, approximately 06:53 UTC: **24/24 PASS in 1.7 minutes**, with the same loopback/synthetic-secret/installed-Edge configuration used by the focused cases:

```text
npx playwright test e2e/trainer-approval-local-regression.spec.ts e2e/public-trainer-local-regression.spec.ts e2e/catalog-local-regression.spec.ts e2e/certifications-local-regression.spec.ts e2e/fee-settings-local-regression.spec.ts e2e/booking-local-regression.spec.ts e2e/trainer-profile-local-regression.spec.ts --project=chromium --workers=1
```

`npm run typecheck` passed again after the selector correction; `git diff --check` passed. Local fixture server stopped and its buffered output contained no additional runtime error. This is not a resolution of the earlier intermittent memory warning. No server/test process was intentionally left running for this pass.

Status: **PASS for the scoped local implementation, SQL and browser regressions; production remediation NOT VERIFIED**. Publish to the audit branch only. Production and full money-flow signoff remain withheld.
