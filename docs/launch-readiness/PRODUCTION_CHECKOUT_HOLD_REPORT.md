# Production Legacy Checkout Hold

**Recorded:** 2026-10-18 06:34 UTC (2026-10-17 23:34 PDT)  
**Environment:** Public Production `trainr.cc` and `www.trainr.cc`, Vercel project `styleres-projects/trainr-node`  
**Audit-branch source SHA:** `2c935dd2d7a65bf86acc8a0c4176a76fd84eab01`  
**Public deployment source SHA:** `2067e743c54ffee669cd484f26dc472b157f1881`  
**Account:** Vercel project owner session; unauthenticated HTTP probes only. No customer credentials or payment data used.

## Decision And Change

The owner explicitly approved a reversible Production checkout block. The old public deployment has a confirmed booking API schema error (`payments.stripeCheckoutSessionId` absent), while the preserved legacy restore has 19 positive terminal payment records without complete provider receipt verification. Accepting new card purchases on that deployment is not signed off.

Created and **published** the enabled Vercel Project Firewall rule `TRAINR temporary legacy web checkout hold` (rule ID `rule_trainr_temporary_legacy_web_checkout_hold_vcras9`). It uses `Deny` for either exact Request Path:

- `/api/payments/checkout`
- `/api/package-purchases/checkout`

The existing `TRAINR temporary voice payment hold` remained active and unchanged. The new rule is a persistent action until deliberately deactivated/published; no code deployment, database write, domain switch, or Stripe transaction was made. [Firewall rules](https://vercel.com/styleres-projects/trainr-node/firewall/rules). Screenshot: [active rules](checkout-waf-active.png).

## Live Retest

Steps: submit unauthenticated `POST` with `{}` to each checkout path on both public hostnames. Expected: edge denial before the application can create a Checkout Session. Actual: all four returned HTTP **403** with `x-vercel-mitigated: deny` (4/4 PASS). Before publication, an anonymous POST to `/api/payments/checkout` reached the app and returned 401, so the observed 403 is a meaningful change.

Steps: `GET` public home, `/auth/signin`, and `/browse`. Expected: unaffected public navigation. Actual: all three returned HTTP **200** on `trainr.cc`; `www.trainr.cc/auth/signin` also returned **200** (4/4 PASS). The first probe used the nonexistent guessed `/auth/login` path and returned 404; inspecting the actual site navigation showed `/auth/signin`, which passed on retest. No authenticated user flow or completed purchase was tested by this containment check.

## Rollback Gate

Keep the rule active until the Production schema/migration, legacy payment reconciliation, live-mode provider receipts, Connect onboarding, signed sandbox purchase/booking/webhook/transfer/payout evidence, and final live smoke are independently verified and recorded. To roll back, open the rule in the Vercel Project Firewall, deactivate it, **Review Changes**, then **Publish**. Recheck that legitimate checkout requests reach the intended new application and that browsing/sign-in remain reachable. Do not remove the separate voice hold as part of this rollback.

**Status:** Containment PASS; money flow and Production release remain **HOLD**. No fix or deployment to the old application is claimed.
