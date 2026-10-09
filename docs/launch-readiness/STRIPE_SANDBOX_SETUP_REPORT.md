# Stripe Sandbox And Preview Isolation

2026-10-09 04:38 UTC update: the owner approved the previously pending Neon and sandbox-secret operations. The free Preview-only database and both sandbox destinations are now created; branch-scoped secrets are saved. [Current provisioning results and remaining owner/runtime gates](STAGING_PROVISIONING_REPORT.md). The earlier sections below are historical baseline evidence, not the current configuration status.

- Recorded: 2026-10-09 03:55 UTC (2026-10-08 evening America/Los_Angeles).
- Baseline commit: `537f285e00ccc4ca8dc6a109b975b21a466adaa7`.
- Verified source commit: `b16e98e8093c9e21badaece95da722189757d385`.
- Environment: local synthetic tests; authenticated Vercel and Stripe dashboards.
- Accounts: Vercel `styleretech`, team `styleres-projects`; Stripe existing owner session. No parent or trainer application account was used in this setup pass.
- Overall status: **HOLD**. This is setup evidence, not a completed provider payment test or production signoff.

## Access And Isolation Evidence

| Steps / route | Expected | Actual | Result |
| --- | --- | --- | --- |
| Open `https://vercel.com/login` | Allow owner login | Existing session redirects to authenticated team dashboard | PASS: access |
| Inspect Stripe dashboard with `get_dashboard_context` | Determine account and mode before writes | `acct_1RAklzLFvcRfmHtc`, Style.re, `livemode: true` | PASS: mode identified; no live mutation |
| Account switcher > Switch to sandbox > Style.re sandbox | Select existing non-live environment | `acct_1RAkm8PvdPuIlEw5`, `/test/dashboard`, `livemode: false` | PASS: sandbox selected |
| Sandbox `/test/connect/accounts` | Observe current trainer-account prerequisites | All 0; no connected accounts | OPEN: create via TRAINR after staging setup |
| Workbench > destinations | Inspect sandbox webhook destinations | Empty destination setup screen | OPEN: no TRAINR destination configured |
| TRAINR Vercel Environment Variables > Preview | Verify isolation rather than copy production configuration | Initially no Preview variables | OPEN at baseline |
| Add `NEXT_PUBLIC_APP_URL` and `NEXTAUTH_URL` as Config | Branch-only callback URLs; Production excluded | Both saved for Preview branch `codex/payment-readiness-20261006`; success toast says redeploy required | PASS: saved; runtime not redeployed |
| TRAINR Storage > Create Database > Neon > Continue | Inspect independent PostgreSQL setup | Integration terms gate, before plan selection | AWAITING OWNER APPROVAL; nothing provisioned |

Both saved URL values are:

`https://trainr-git-codex-payment-readiness-20261006-styleres-projects.vercel.app`

No production variable was changed, copied or revealed. No Stripe key was revealed, copied, rotated or stored. No webhook destination, test customer, connected account, charge, transfer, refund or payout was created during this pass.

## Separate Webhook Secrets

Stripe's destination setup exposes mutually exclusive **Your account** and **Connected accounts** scopes. TRAINR's destination-charge payment events are platform-scoped; trainer `account.updated` events need the connected-account scope. See [Stripe Connect webhook documentation](https://docs.stripe.com/connect/webhooks).

The existing verifier accepted only `STRIPE_WEBHOOK_SECRET`. A real Stripe SDK signature generated with a separate synthetic Connect destination secret failed verification. The regression suite initially failed 2 of 7 tests: separate signature acceptance and independent configuration reporting.

Fix:

- Keep `STRIPE_WEBHOOK_SECRET` for platform payments.
- Add `STRIPE_CONNECT_WEBHOOK_SECRET` for a second Connected accounts destination using the same `/api/payments/webhook` URL.
- Verify the raw body with Stripe's SDK before accepting a fallback signature.
- Require a connected-account scope for the second secret, and matching account identity for `account.updated`.
- Preserve the existing route's rejection/ignore rules for connected-account payment events, so these cannot settle platform bookings.
- Expose `connectWebhookConfigured` separately; existing `isFullyConfigured` alone is not proof of both destination configurations.

### Tests And Retest Proof

- Initial focused existing suite: 65/65 passed. All external provider operations were mocked; signature tests used the real SDK with synthetic secrets.
- New regression before repair: 2 failed, 5 passed. The failure was `No signatures found matching the expected signature for payload`.
- After repair, focused checkout/Connect/signature/payout/readiness/scope suites: 72/72 passed.
- Additional route tests cover trainer readiness writes, retryable persistence failure and scope rejection. Final `npm run check` completed successfully before 2026-10-09 04:02 UTC: lint (existing warnings), typecheck, **956/956 tests in 47 files**, Prisma generation and Next production build (73/73 static pages generated). The 12 new scope tests all passed, using synthetic secrets and mocked persistence.
- Real database integration tests and browser E2E were not rerun in this pass. Provider-backed application tests remain blocked on staging setup; no synthetic result is counted as a real Stripe payment.
- Initial restricted-shell launch failed to load Vitest configuration because a parent directory was inaccessible. The approved unrestricted local run resolved that tool restriction.

## Remaining Setup Gates

1. Owner approval is requested at the Neon integration terms screen. Terms mention sharing Vercel ID, email and usage data with Neon. A free plan must be verified before provisioning; no paid subscription is authorized.
2. Owner approval is requested before granting TRAINR Preview access to the existing Style.re sandbox through its test API keys and destination secrets. A separate TRAINR sandbox is an alternative.
3. Provision independent empty PostgreSQL, inspect its identity and apply migrations only there. Never clone or reuse the production database for these tests.
4. Configure an independent staging `NEXTAUTH_SECRET` through owner credential handoff, plus sandbox keys and both webhook secrets in the audit branch scope. Never put values in Git, chat or logs.
5. Verify that the eventual webhook URL is reachable by Stripe while preserving deployment protections; a narrowly scoped ingress arrangement may require additional approval. Prior SSO/client-block observations are not successful webhook evidence.
6. Redeploy the audit branch and verify runtime database access and test mode before creating synthetic parent/trainer fixtures.
7. Test parent booking, full test-mode Checkout, signed callback, persistence after refresh, trainer onboarding, trainer balances, destination transfer and Stripe-managed payout status. None of these provider-backed application flows passed in this setup pass.

The earlier signed-out Stripe blocker is superseded by authenticated sandbox access. It must not continue to be reported as the current blocker. Production migration, package flows, scheduling decisions and the other documented release gates remain open.
