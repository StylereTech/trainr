# Package Purchase UI Verification

## Scope

- Date: 2026-10-13 UTC; baseline `02aeb22002eccd99db8d0d6ccc40bb4c664ec048`, isolated audit branch `codex/payment-readiness-20261006`.
- Previous goal turn was progress: checkout API and financial guards were tested, published and anonymously retested. This pass connects that API to the parent purchase experience. The full production-readiness goal remains active.
- Test environment: guarded disposable PostgreSQL `trainr_audit_timezone_20261011`, loopback 55439, synthetic `@example.test` accounts, local JWTs and fake provider responses. No actual Stripe transaction or payout is implied.
- Surfaces: trainer profile package link; `/parent/packages/buy/<packageId>`; `/parent/packages/<purchaseId>/checkout`; GET `/api/package-purchases/review`; POST `/api/package-purchases/checkout`; parent purchase history navigation and parent/trainer financial-review display.
- Main, Production, Story, Replit, provider credentials and real funds are excluded. No schema/migration/dependency change.

## Implementation

The parent reviews full package contents, service duration/type, full USD price, family sharing, validity and cancellation terms before consenting and opening Stripe Checkout. Existing purchases show their immutable bought terms even after the catalog changes. Legacy terms stay explicitly legacy and cannot start a new charge. New Stripe attempts return to the owned purchase review page; existing stored attempt parameters are not rewritten. A return query parameter never establishes payment success.

The new review reader validates current parent access and ownership and returns only bounded safe fields. Existing-purchase review reuses checkout payability checks without provider calls. New-offer review and preparation share catalog validation. Mutations continue to recheck current catalog and financial/account state; display eligibility is advisory.

An initial request is written and read back from buyer/package-scoped session storage before POST. Storage failure/corruption blocks new checkout rather than discarding an unknown attempt. Reloads look up the original request under current ownership and resume the same purchase. Unknown responses, unsafe redirect URLs and ordinary rejections preserve the request. Only an explicit server `OFFER_CHANGED` response, issued before a new purchase exists, permits review of a new quote. Existing-purchase conflicts never use that reset path. Known purchase IDs survive reloads through the URL and need no browser-stored provider credentials. A verified paid purchase can explicitly start review of another purchase; no automatic repeat charge occurs.

Checkout now blocks missing/invalid trainer time zones because credits could not otherwise be scheduled. Financial-review history filtering and labels now retain every SQL-non-null flag, including false, zero, empty string and JSON null, consistently with the payment-release guard.

## Initial Failures And Retests

1. Initial TypeScript check passed: `.postgres-test/package-purchase-ui-typecheck.log`.
2. Missing time-zone reproduction: **1 failed / 271 skipped**, start **10:24:56 UTC**, 10.58 seconds. Checkout returned a simulated URL even though the trainer could not provide usable booking times. Log: `.postgres-test/package-purchase-ui-zone-baseline.log`. New-offer display and checkout now both require a canonical time zone; eligible test trainer fixtures explicitly use UTC.
3. Browser-side persistence/response contracts: **41/41 PASS**, two files, start **10:25:18 UTC**, 1.70 seconds. Includes 27 new recovery/client cases and 14 existing request/URL contract cases. Log: `.postgres-test/package-purchase-ui-client-tests.log`.
4. History flag reproduction: **4 failed / 272 skipped**, start **10:26:29 UTC**, 3.22 seconds. False/zero/empty-string flags appeared without review warnings; JSON null disappeared from the review filter entirely. Log: `.postgres-test/package-purchase-ui-history-baseline.log`. Filtering now distinguishes SQL absence from JSON null and computes display presence from SQL instead of JavaScript truthiness.
5. First full package SQL file: **275 passed / 1 failed**, start **10:26:56 UTC**, 47.30 seconds. The remaining failure was a historical test explicitly treating both SQL null and JSON null as absent review state, conflicting with the existing SQL hold rule and newly reproduced checkout behavior. The two-case test now asserts their distinction, including both filter results and `reviewRequired`; it was not removed or reduced to a weaker assertion. Log: `.postgres-test/package-purchase-ui-focused-sql.log`.

Corrected SQL, final quality gate, browser/visual verification and publication evidence are recorded after execution. No pending check is marked passed.

Corrected focused SQL file: **276/276 PASS**, start **10:31:35 UTC**, 70.02 seconds. Log: `.postgres-test/package-purchase-ui-focused-sql-retest.log`. Expanded TypeScript check also passed, `.postgres-test/package-purchase-ui-typecheck-final.log`. Full SQL and the built browser workflow remain separate gates below.

## Full SQL

**981/981 PASS**, 16 files, start **10:33:41 UTC**, 169.38 seconds. Log: `.postgres-test/package-purchase-ui-full-sql.log`. This includes all 276 package checkout/review/history cases, prior credit reservation/action/ledger cases, and the joined checkout-to-sibling-booking lifecycle. No real provider network was used. The full quality gate starts only after the SQL process exits, avoiding the prior Windows client-DLL generation overlap.

## Browser Baseline

Initial four-case run: **3 passed / 1 failed**, 1.5 minutes, `.postgres-test/package-purchase-ui-browser-focused.log`. The desktop normal case exceeded the existing 30-second test budget after reaching the owned return page; its trace shows both payment-status assertions passed. It remains recorded as a failed run, not a pass. No timeout increase or automatic retry was introduced. Baseline traces/screenshots were preserved under `.postgres-test/package-purchase-ui-browser-baseline-artifacts`.

Visual inspection found unbroken package names spilling out of the public profile card even though the document-width assertion passed (the containing layout hid the overflow). The strengthened heading-level width assertion reproduced this: **1 passed / 1 failed**, 23.4 seconds, `.postgres-test/package-purchase-ui-overflow-baseline.log`. Artifacts are preserved under `.postgres-test/package-purchase-ui-overflow-baseline-artifacts`. The package text column now shrinks and wraps titles/descriptions/item labels, keeps icons visible, and reserves the price column. Final assertions also check that the heading stays within the viewport. A full quality gate and rebuilt browser retest are required before publication.

## Quality Gate Retest

The first post-layout `npm run check` exited **1** at **10:55:08 UTC**: lint 0 errors/42 existing warnings, types passed, units **1,594 passed / 1 failed** (73 files, start 10:54:20 UTC, 48.18s). The existing `tsx resolved esbuild > bundles TypeScript with imports and source maps` case exceeded 5 seconds; the build phase did not run. Log: `.postgres-test/package-purchase-ui-final-check.log`. The same esbuild file passed **5/5**, start **10:55:16 UTC**, 4.12s with one worker and unchanged assertions/timeouts, `.postgres-test/package-purchase-ui-esbuild-retest.log`. This alone is not a full-gate pass; the unchanged `npm run check` was restarted at **10:55:29 UTC** and its terminal result is recorded below.

The unchanged full rerun exited **0 at 10:58:26 UTC**: lint 0 errors/42 existing warnings; types passed; **1,595 units / 73 files passed**, start 10:56:14 UTC, 30.42s; Prisma generation, optimized compilation (31.0s), build TypeScript (7.5s), and **84 generated pages** (4.1s) passed. Log: `.postgres-test/package-purchase-ui-final-check-retest.log`. Existing middleware deprecation warning remains. No app source changed after this successful build.

## Browser Harness Corrections

First complete new-spec run on the rebuilt app: **20 passed / 12 failed**, 2.6 minutes, `.postgres-test/package-purchase-ui-browser-retest.log`. Both normal workflows and both strengthened long-title cases passed. Two failures were the test parsing valid relative 307 locations without a base; ten were broad alert locators also matching Next's hidden route announcer. Tests now resolve redirects against the configured loopback origin and assert both origin and exact destination; alert assertions target the application alert containing the purchase-history recovery link. Retry-body assertions explicitly await the second intercepted request before inspecting it. All existing behavioral assertions remain, with unchanged timeouts and no retries. Baseline artifacts retained under `.postgres-test/package-purchase-ui-browser-first-full-artifacts`.

## Reproduction Steps

Use the guarded local database and unique synthetic parent/trainer fixtures from `e2e/fixtures/local-auth.ts`; browser JWTs are local test credentials, not proof of hosted sign-in. Run the built app at `http://127.0.0.1:3108` with local-only auth values and fake Stripe keys. No hosted credentials are loaded.

| Case | Exact action | Expected result |
| --- | --- | --- |
| Normal, 1440/390px | Open synthetic trainer, Services, Review package; inspect total/terms; try payment before consent; check consent and pay; return to owned checkout URL | Consent required; one synthetic purchase; safe mocked Stripe URL; return still says payment not recorded |
| Interrupted/invalid provider result | Abort before/after fixture persistence, return malformed JSON/unsafe URL/503; reload review; consent and retry | Same initial request when absent, otherwise same owned purchase ID; no duplicate purchase |
| Changed quote | Return explicit fresh-offer 409 and change catalog price from 6000 to 7000 cents | New displayed quote, unchecked consent, new request only after renewed consent |
| Browser storage | Deny read/write or insert malformed saved JSON, then attempt checkout | Visible recoverable error and no outgoing payment POST |
| Review read | Return 503 or a different buyer identity | Reload recovers transient read; foreign identity cannot expose payment action |
| Financial hold | Seed SQL JSON-null review flag on owned pending purchase; open review and history review filter | No checkout button; financial-review warning and history link retained |
| Explicit repeat | Seed a synthetic verified paid receipt after return, reload, choose Review another purchase | New review requires consent and does not automatically send another POST; fixture is not provider evidence |
| Long title | Display a 150-character unbroken package title on public profile and open its review | Text stays within its heading and viewport at both widths; screenshots visually checked |
| Role protection | GET both parent pages without auth and as trainer; GET review API | Same-origin 307 to sign-in/dashboard and JSON 401/403 respectively |

The browser suite intercepts checkout creation and Stripe navigation, while real PostgreSQL tests separately cover the actual route and provider orchestration under mocks. Neither is described as an actual sandbox payment.

## Final Browser Verification

**112/112 PASS**, one worker, zero retries, **8.6 minutes**, completed before **11:11 UTC on 2026-10-13**. Log: `.postgres-test/package-purchase-ui-browser-final.log`. Command: `npm run test:e2e -- e2e/package-purchase-local-regression.spec.ts e2e/package-history-local-regression.spec.ts e2e/credit-reservation-local-regression.spec.ts e2e/checkout-recovery-local-regression.spec.ts e2e/trainer-packages-local-regression.spec.ts e2e/package-sales-local-regression.spec.ts --workers=1 --retries=0` with loopback `BASE_URL`, local-only auth secret and guarded disposable `TEST_DATABASE_URL`.

This consists of 32 new purchase cases, 24 history cases, 16 credit-reservation cases, 24 checkout-recovery cases, 12 trainer-package cases and four sales HTTP role cases. It is a selected regression run, not all repository E2E tests or a hosted Stripe run. The new cases assert no page errors and no incidental bookings/payments/wallet writes. Trainer package lifecycle uses real local catalog routes; initial purchase POST and provider navigation remain explicitly mocked as described above.

Visually inspected full-page normal review and long-title public-profile screenshots at 1440px and 390px: readable wrapping, visible controls, fixed 40px refresh action, no title escape or overlapping price. Saved evidence: [desktop review](screenshots/package-purchase-review-1440.png), [phone review](screenshots/package-purchase-review-390.png), [desktop long title](screenshots/package-long-title-1440.png), [phone long title](screenshots/package-long-title-390.png).

Independent `psql` readback after the suite confirmed the disposable guard and **zero users, bookings, payments, purchases, attempts, grants, receipts, redemptions and sports**. Log: `.postgres-test/package-purchase-ui-cleanup.log`. Local Next and owned PostgreSQL cluster were stopped. No unknown data was deleted. Post-harness `npm run typecheck` also exited 0, `.postgres-test/package-purchase-ui-browser-types.log`.

## Remaining Gates

Actual signed-in hosted Stripe Checkout, signed provider webhook delivery, Connect onboarding, destination transfer and payout proof remain required. Current Preview trainer setup/catalog eligibility, CI execution, deferred email setup, pending expiry/retirement policy and previous release gates remain open. Other financial-review read projections still require their own JSON-null audit; correcting checkout/history does not prove every reader correct. Production readiness remains **HOLD**.
