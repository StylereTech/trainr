# Durable Checkout Rollout Gate

Date: 2026-10-08 UTC. Original source baseline: `4de8acd039cc5de6f6a63da6b39bb22392d3bcda`. Updated local SQL proof uses application baseline `ac7c579e1fcd5af6fc06f11b5678a458aec25766`. Environment: local Windows, synthetic tests. No production database or Stripe credentials used. Status: source implemented; exact migration and 12 integration cases PASS on disposable local PostgreSQL 16.15. Staging/production migration and live money-flow verification NOT performed. See [reproduction and evidence](POSTGRES_INTEGRATION_REPORT.md).

## Why This Is Required

`CheckoutAttempt` saves a payment's exact Stripe request parameters before any external create call. Each attempt has a stable random ID used as its Stripe idempotency key. A retry cannot change the amount, destination account, customer email or return URLs inside an already-started attempt. Open sessions are resumed. A new attempt is allowed only after the prior session is verified expired and any associated PaymentIntent is verified cancelled. Missing resources, transient failures and unknown outcomes never authorize a new attempt.

Unknown outcomes without a saved session ID can be retried with the same request for less than 23 hours after attempt creation. Older unknown outcomes require operator reconciliation because Stripe may prune idempotency keys after 24 hours. Known session IDs are retrieved independently of that time limit. Legacy payment rows without a known session or attempt require reconciliation; there is no safe automatic assumption that an earlier request never reached Stripe.

The webhook also uses current attempt identity. Old-attempt events cannot mutate a replacement attempt. A verified paid session recovered by a checkout retry uses the same transactional payment/booking confirmation path as a signed webhook.

## Apply Before Deployment

Reviewed additive SQL: `prisma/migrations/20261008040000_add_checkout_attempts/migration.sql`.

1. Provide an isolated PostgreSQL environment and Stripe test-mode account. Confirm its database and Stripe accounts are not production. Do not paste credentials into chat or commit them.
2. Inspect the actual database migration history and backup/restore procedure. This repository has no full initial-schema migration; do not assume `prisma migrate deploy` can initialize a new empty database or safely repair existing drift.
3. Apply the reviewed additive SQL using the environment's established migration process. It creates only `checkout_attempts`, its foreign key, sequence constraint, session/sequence uniqueness, and a partial unique index allowing only one non-retired attempt per payment. Do not use `db push` as a production rollout shortcut: the partial unique index is explicit SQL, not fully represented in the Prisma model.
4. Verify table columns, constraints and the partial index in PostgreSQL. Confirm a second active attempt for the same payment is rejected and that retiring the old attempt and adding its replacement is atomic.
5. Run the staging matrix below with concurrent independent connections. Local transaction-model tests are not proof of PostgreSQL locking or network recovery.
6. Only after all financial and security release gates pass, apply the migration before deploying the new application to the actual `trainr-node` Vercel project. A push to the Git-connected `trainr` project is not a production deployment to `trainr.cc`.

Do not deploy the new webhook/checkout code against a database without this table. Do not roll back to the old non-idempotent checkout implementation during in-flight attempts without a payment freeze and reconciliation. Keep attempt records and their original parameters; do not manually clear IDs, retire attempts or delete records to force a retry.

## Required Staging Evidence

| Test | Expected Result | Current Proof |
| --- | --- | --- |
| Three concurrent checkout requests | One active attempt and one payable Stripe session; same returned URL | Real local PostgreSQL: one persisted attempt/key/session identity; Stripe provider simulated, actual payable-session behavior still unverified |
| Timeout after Stripe acceptance | Retry uses identical parameters/key and recovers the original session | Model test only |
| DB save failure after Stripe create | Durable attempt remains; retry recovers the same session | Model test only |
| Unknown outcome older than 23 hours | Conflict and operator reconciliation; no new create | Model test only |
| Open-session retry | Retrieve/resume; no expiry or second create | Model test only |
| Expired session with cancelled/no intent | Retire old attempt and create one replacement; preserve history | Model test only |
| Expired session with unresolved intent | No replacement and no automatic charge/cancellation | Model test only |
| Late event from retired attempt | Rejected without changing current payment | Model test only |
| Stripe paid but webhook delayed | Retry reconciles payment and booking once, without another session | Model test only |
| Cancelled booking or fast success during checkout | No new payable URL returned; terminal state preserved | Model test only |
| Full destination-charge money flow | Parent receipt, correct platform fee, trainer transfer, verified refund/reversal and bank payout evidence | NOT tested live |

For each staging case record commit SHA, account alias, UTC timestamp, request/response status, attempt/payment/session/intent/event IDs, database readback after refresh, and cleanup/reconciliation outcome. Do not put secret keys or customer personal data in public reports.

## Reconciliation

An operator must inspect the attempt's exact metadata and destination in Stripe before allowing another payment. If a session exists, record/verify its identity through a reviewed repair procedure and reconcile its actual paid/expired/processing state. An old unknown attempt is not permission to charge again. Existing historical duplicate sessions and legacy wallet entries require their own reconciliation; this migration does not prove they never existed or settle them.

Reference: [Stripe idempotency key retention](https://docs.stripe.com/api/idempotent_requests) and [Checkout session expiry](https://docs.stripe.com/api/checkout/sessions/expire).
