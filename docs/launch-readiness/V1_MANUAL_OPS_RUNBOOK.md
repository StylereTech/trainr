# V1 Manual Ops Runbook

2026-10-08 deployment gate: live domains belong to `trainr-node`, not the Git-connected `trainr` previews. Do not copy production credentials into Preview or run migrations without staging rehearsal/backup review. `verify:prod` requires live configuration; its success is not money-flow approval. `db:check` now executes read-only SQL but does not check schema or writes. Follow the [configuration audit and safe rollout gate](DEPLOYMENT_CONFIGURATION_REPORT.md). Owner staging configuration and GitHub billing remain required actions.

2026-10-08 Connect identity update: both setup endpoints now preserve existing Stripe account IDs and share a durable, bounded-idempotency creation attempt. Ambiguous/expired creation requires reconciliation, not replacement; provider failures no longer expose cached readiness as current truth. Dashboard status is schema-validated and retryable; creation email is redacted on success or closure. Baseline `0eab36674bbbfaf75d84d0671f0ca30869771a16` plus this commit. **644 unit tests and 134 real local PostgreSQL tests passed**; exact routes, accounts, initial failures, migration/ops requirements and final browser/build/publication evidence are in the [Connect identity report](CONNECT_ACCOUNT_IDENTITY_REPORT.md). Stripe is simulated. No production migration/promotion or real money movement; full readiness and money-flow signoff remain HOLD.

2026-10-08 dashboard data update: parent/trainer booking counts and history are now role-scoped and paginated from a consistent SQL snapshot. Failed/malformed reads show explicit errors, trainer actions reload persisted state, and booked allocations are no longer presented as total earnings. Stripe balances remain provider-sourced with unknown/error states. Baseline `0dfd7a19e9155facc7be7a95e41cb741fb5ba0be` plus this commit; **634 unit tests and 114 real local SQL tests passed**. Exact routes, accounts, steps, initial failures, browser retest and publication evidence are in the [dashboard integrity report](DASHBOARD_DATA_INTEGRITY_REPORT.md). External Stripe observations in tests are simulated. No real charge/refund/transfer/payout, production migration or production promotion occurred; full production and money-flow signoff remain HOLD.

2026-10-08 refund reconciliation update: per-refund provider observations now separate successful, pending and failed/cancelled outcomes; legacy totals require verification. Reconciliation is transactional with notices/audit, handles signed lifecycle events and exposes an admin read-only Stripe refresh. Baseline `0cfb4f550b88271d273bb4e744e44ca82fedfbf6` plus this commit. **613 unit tests, 106 real local SQL tests, production build and six focused desktop/mobile refund browser checks passed**. Exact accounts, steps, routes, expectations, actual results, initial disk failure, retest and final broader-browser/publication evidence are in the [refund audit](REFUND_RECONCILIATION_REPORT.md). Stripe reads are simulated locally; production smoke was anonymous and on older code. No real refund/transfer/payout or production migration occurred. Full production/money-flow signoff remains HOLD; this is not refund execution or Connect/payout verification.

2026-10-08 account operations update: account deactivation ends access and anonymizes selected profile fields but retains financial/audit history. It does **not** cancel/refund existing bookings, expire issued Stripe checkout URLs, close Connect accounts or settle payouts. Reconcile those separately. Admin changes require the reviewed revision; reload after conflicts/uncertain responses. Use another active admin to deactivate an admin; never bypass last-admin checks with direct SQL. The new `deletedAt` migration and prior `sessionVersion` migration must precede rollout. [Verified operations and limitations](ADMIN_ACCOUNT_INTEGRITY_REPORT.md).

2026-10-08 session release requirement: apply/rehearse the additive `sessionVersion` migration before deploying the new authentication code. All pre-version sessions must sign in again; successful password reset, self-deletion and role changes increment the version. Do not roll back to code that trusts stale claims, lower versions, or treat a preview build as production revocation proof. Exact verified steps and remaining privileged-account remediation are in the [session audit](SESSION_REVOCATION_REPORT.md).

## Status And Evidence

- Public trust update, 2026-10-08: listing approval must not be represented as identity/background screening. An individual credential's recorded verification is not a whole-trainer safety guarantee. Before production publication, owner must confirm actual screening operations, safety mailbox ownership/delivery and escalation coverage; no response SLA was verified. See [tested copy and rollout limits](PUBLIC_TRUST_REPORT.md). Do not restore unsupported counts/testimonials without evidence.

- Updated: 2026-10-08 UTC. This replaces the April wallet-withdrawal instructions; do not follow those historical instructions.
- Source: baseline `0cabd2557962a44f4b6365512ea407ed76121f9f` plus the booking-action commit containing this revision.
- Environment tested: local Windows Node 22; synthetic parent, trainer, admin and payment fixtures. No real account or Stripe mutation in this pass.
- Endpoints tested with mocked dependencies: `PATCH /api/bookings/[id]`, `PATCH /api/admin/bookings`.
- Expected/actual: authenticated transitions commit once with statistics, notifications and admin audit; invalid transitions reject and injected failures roll back. Focused 50 tests passed. Full-check and publication evidence: [current checkpoint](AUDIT_CHECKPOINT_2026-10-06.md).
- Release decision: **HOLD**. This is an exception-handling procedure, not production money-flow signoff. Real database locking, migration, checkout, refunds and bank settlement remain unverified.

## Daily Review

1. Use a dedicated authorized operator account. Shared privileged demo credentials and existing sessions must be remediated before launch.
2. Review stale pending bookings, cancelled bookings with payments, payment-review notifications and failed webhook deliveries.
3. Compare application booking/payment identities with the platform's Stripe PaymentIntent, Charge and Checkout Session. Match amount, currency, mode and destination account; never match only by customer email or an arbitrary metadata field.
4. Check connected-account capabilities and actual Stripe balance/payout history. Provider errors are unknown state, not proof of a zero balance or completed payout.
5. Record UTC time, operator, booking/payment IDs, deployment/source, provider object IDs, observed states, decision and retest evidence in an access-controlled incident record. Do not include secrets or payment-card data.

## Checkout Exceptions

1. Refresh the parent's booking state first. A return URL or `payment=success` is not payment evidence.
2. For unpaid pending/confirmed bookings, use the existing checkout retry. The durable attempt must reuse its immutable request and idempotency key. Do not create a second payment manually to overcome an unknown outcome.
3. If an attempt has no saved provider ID and its recovery window expired, reconcile through Stripe request logs before allowing any replacement. A missing local ID does not prove no charge occurred.
4. For a paid provider object with stale app state, verify identities and replay the relevant signed webhook through Stripe's supported tooling. Recheck stored payment and booking after refresh. Never set `SUCCEEDED` directly to conceal a delivery failure.
5. Apply and verify the [checkout-attempt migration](CHECKOUT_ATTEMPT_MIGRATION.md) in isolated staging before promotion. Do not run schema push as a substitute for the partial unique index.

## Cancellation And Refund Exceptions

1. A booking cancellation stops the application reservation but currently does **not** expire an in-flight Checkout Session, cancel its PaymentIntent, submit a refund, reverse a transfer, or create a promotional credit. Automated cancellation/refund recovery remains a launch blocker.
2. Both booking-action endpoints use the same transaction and cannot resurrect terminal bookings. Repeated identical actions do not duplicate notifications, trainer counters or audit entries. Cancellation with an existing nonzero, not-fully-refunded payment raises operator review and tells the customer that cancellation is not a refund receipt.
3. Inspect the actual Checkout Session/PaymentIntent before determining whether payment remains possible, was captured, was already refunded, or is uncertain. Late successful payment must remain attached to the cancelled booking for reconciliation; do not reopen the reservation automatically.
4. The published policy includes parent timing rules, automatic trainer-cancellation refunds and late-cancellation credits. Trainer timezone and exact boundary/credit semantics must be resolved and implemented. Do not silently substitute an invented timezone, percentage or policy.
5. For an owner-authorized exception refund, verify the original charge, remaining refundable amount, destination account, prior refunds and reversals, and approved entitlement. Use the original charge/intent, not a new transfer to the customer. After an uncertain request, retrieve its outcome before retrying; never generate another refund blindly.
6. Destination-charge refund design must explicitly account for the related transfer and application fee. Stripe exposes separate `reverse_transfer` and `refund_application_fee` controls; partial reversals/fee refunds are proportional. Review the actual object results, not only a successful HTTP response. [Stripe refund API](https://docs.stripe.com/api/refunds/create)
7. Record the refund's provider ID and actual status, transfer reversal, fee refund, webhook delivery and application cumulative refund amount. Pending/failed refunds are not receipts. Verify the customer-facing state after refresh. This procedure has **not** been exercised against test-mode or live funds in this audit.

## Trainer Payouts

Trainer eligibility changes: review fresh trainer data and submit its exact `updatedAt` as `revision` to `PATCH /api/admin/trainers/[id]`. Reload/review after a 409 or uncertain response; do not blindly repeat a mutation. Approval, audit and applicable notification commit together. Suspension/deactivation stop new application reservations/checkouts, but do **not** expire already-issued Stripe sessions, cancel existing bookings or issue refunds. Inspect open provider objects and reconcile any late funds under the cancellation procedure above. [Tested behavior and limits](TRAINER_APPROVAL_INTEGRITY_REPORT.md).

1. The intended v1 path is the destination charge to the connected Stripe account, followed by Stripe-managed bank payout according to the verified account configuration.
2. Do **not** pay again from the legacy wallet or mark an old withdrawal request paid as a substitute. Those mutation endpoints are disabled on the audit branch. Recorded trainer share is not a second disbursement instruction.
3. Reconcile the platform charge, destination transfer, connected balance and payout separately. A transferred amount is not proof that a bank payout settled.
4. Resolve capability restrictions, failed payouts or negative-balance/refund issues in the authorized Stripe account workflow. Record provider evidence before reporting funds received.

## Release Gate

Verify isolated SQL transactions with independent connections; paid checkout and delayed/duplicate webhook delivery; both cancellation/payment race orders; approved partial/full refunds and reversals; failed/pending refund recovery; trainer proceeds and bank payout evidence; secure operator access; the correct production project `trainr-node`; and final live smoke tests. Git previews in project `trainr` do not publish `trainr.cc`.

Current result: local transition guards verified; automatic refunds, production persistence and actual settlement **NOT VERIFIED / NOT SIGNED OFF**. Full open findings and dated retest proof remain in the checkpoint, not the superseded April conclusions.
