# Support Credit Coupon Safeguard

**2026-10-17 17:56 UTC. Decision: Production HOLD.** Source `9675c0d7212e63109a3a04b90a00d09125a9393d` on isolated audit branch `codex/payment-readiness-20261006`. GitHub [Preview deployment 7143485686](https://github.com/StylereTech/trainr/deployments/7143485686) reports `success` at 17:54:07 UTC, immutable URL `https://trainr-jqxuv64m1-styleres-projects.vercel.app`; the stable audit alias was used for browser testing. Main, Production, Story, real funds and Production coupons were not changed.

## Scope And Accounts

- Local routes/modules: admin `POST /api/admin/coupons`, `src/app/admin/coupons/page.tsx`, parent booking quote and reservation unit tests. The approved synthetic Preview ADMIN account was used for the hosted UI/API test; credentials came from the ignored local test file and were not printed or committed.
- No real coupon was created. Hosted `GET /api/admin/coupons?limit=1` was read twice around one intentionally invalid POST. No paid booking, Stripe charge, credit redemption or database migration was attempted.

## Findings, Fixes And Retest

| Step | Expected | Actual | Result |
| --- | --- | --- | --- |
| Inspect v1 manual credit instructions and coupon creation | Late trainer-cancellation 10% credit must be one use | Existing UI/API defaulted `maxUses` to **100**; an operator could accidentally issue a broadly redeemable code | **FAIL, fixed** |
| Submit malformed admin code, fraction use count, both discount types or invalid date | 400 and no write | Prior API threw validation errors or could normalize a punctuation-only code to empty; new `safeParse` rejects these cases and sanitizes uncertain create errors | **PASS, 17 new local cases** |
| Create a normal coupon in unit test with omitted `maxUses` | One use unless explicitly increased | `LATE10`, 10%, `maxUses: 1`; an explicit 100-use promotion remains accepted | **PASS** |
| Open `/admin/coupons` as synthetic ADMIN, then Create coupon | `Max uses` accessible by label and value 1 | Hosted Playwright **1/1 PASS**, no coupon submission | **PASS in Preview** |
| Attempt invalid code `!!!` in hosted admin API and compare list count | 400 and count unchanged | POST **400**; authenticated GET before/after returned **200** and equal `pagination.total` | **PASS in Preview; no write** |
| Run local quality gate | Lint/types/units/build pass | `npm run check` exit 0: **1,812/1,812** units; TypeScript and production build pass; lint has 42 existing warnings | **PASS locally** |
| Inspect GitHub CI for source commit | `check` and `migrations` execute | [Run 39055699294](https://github.com/StylereTech/trainr/actions/runs/39055699294): both jobs never started; GitHub says account locked due to billing | **FAIL, external** |

The code now defaults admin-created coupons to one use, requires exactly one integer discount, validates the post-normalization code and calendar date, rejects unknown fields, returns a conflict for duplicate codes, and does not expose database diagnostics on uncertain failures. Dialog labels are associated with their controls. Existing generic promotions can still explicitly set a higher use limit.

## 2026-10-17 Parent Assignment Follow-Up

Source after `cb3a9a655d8f5a60b7166a86f0a5d3d64ffff053` on the isolated audit branch, local Windows environment. An additive nullable `recipientParentProfileId` with parent FK is introduced in migration `20261017190000_bind_coupons_to_parent`; old generic coupons remain unassigned. Admin `POST /api/admin/coupons` now accepts an optional active parent email, saves the corresponding profile ID, and lists recipient email only in authenticated admin UI. Parent `POST /api/bookings/quote` and booking reservation both reject another parent's assigned code. Deleting the parent cascades the coupon instead of making it public. Focused unit tests: **114/114 pass**, covering assigned recipient, unknown parent, malformed email, unauthorized quote and reservation. This section is not a production assertion.

**18:22 UTC retest, commit `846433b2e1b6277b4b5fad0faf4a2f89107f1d38`:** Vercel status for isolated branch Preview is `success`; no main/Production deployment. `npm run check` passed locally with lint 42 existing warnings, typecheck, **1,817/1,817** unit tests, and production build. Using the ignored synthetic ADMIN account against `https://trainr-git-codex-payment-readiness-20261006-styleres-projects.vercel.app`, Playwright `preview-coupon-ops.spec.ts` passed **1/1**: `/admin/coupons` showed the labeled parent field and one-use default; authenticated `GET /api/admin/coupons?limit=1` returned 200 before and after invalid POSTs; punctuation-only code and unknown parent email each returned 400; coupon count did not change. This live read exercises the new Prisma relation, but no assigned coupon was created or redeemed. The full SQL migration replay suite could not run locally because no disposable PostgreSQL service was available. The early-consumption issue remains, and Production remains **HOLD**.

## Remaining Money-Flow Gate

Coupon use is counted **at reservation creation**, before Checkout payment; an unpaid or cancelled reservation does not automatically restore the use. One-use codes are not bound to a particular parent. Support must verify the booking/payment and prior code usage before manually issuing a replacement; the [runbook](V1_MANUAL_OPS_RUNBOOK.md#cancellation-and-refund-exceptions) records this limitation. No real 10% credit issuance/redemption, parent-specific enforcement, paid booking or Stripe payout is proven. Restricted trainer Connect capabilities and GitHub CI billing still block full signoff. **Production HOLD.**
