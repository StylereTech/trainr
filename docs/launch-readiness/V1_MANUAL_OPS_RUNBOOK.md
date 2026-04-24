# V1 Manual Ops Runbook

- Date/time: 2026-04-24 00:55 UTC / 2026-04-23 17:55 America/Los_Angeles
- Environment: `https://trainr.cc`
- Commit SHA tested: final pushed commit `71edba76ac7070856ab5a1cffed0b40c9ea8a652`

## Daily Checks
1. Open `/admin` as `admin@trainr.app`.
2. Review `/admin/bookings` for stale `PENDING`, `CONFIRMED`, failed, or disputed records.
3. Review `/admin/payouts` for withdrawal requests.
4. Review `/admin/trainers` for pending or suspended trainer profiles.
5. Review Stripe dashboard for webhook delivery, connected account requirements, disputes, and failed payments.

## Booking And Payment Exceptions
- If a booking has no payment after checkout attempt, ask the parent to retry checkout from dashboard once trainer Stripe onboarding is complete.
- If Stripe shows paid but TRAINR does not show `SUCCEEDED`, replay the Stripe webhook for the relevant event.
- If a wallet credit is missing, verify `checkout.session.completed` metadata includes `bookingId` and that the webhook reached `/api/payments/webhook`.

## Payout Requests
1. Confirm trainer identity and Stripe connected account status.
2. Confirm wallet `availableBalance`, `pendingBalance`, and withdrawal request amount.
3. Process payout externally in Stripe or the agreed v1 ops path.
4. Mark request status according to the operational workflow once admin mutation support is added.

## Expected Result
Ops can keep v1 money movement safe while automated payout processing remains limited.

## Actual Result
Admin payout queue is available; no pending withdrawals were present during this audit.

## Pass/Fail
Pass as a manual v1 runbook. Automated payout processing remains future work.

## Retest Proof
`/api/admin/payouts` returned `200` with an empty queue; admin E2E passed 15/15.
