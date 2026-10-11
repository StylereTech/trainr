# Stripe Sandbox Webhook Ingress Validation

- Tested: 2026-10-11 02:47-02:49 UTC.
- Deployed commit: `0045a96cd9cc0e329f70867d9b1bb0970984c182`, audit branch `codex/payment-readiness-20261006`.
- Deployment: Vercel `trainr` Preview `7qj1TWspENVfnxpkbkkwRgPBpU4n`, observed Ready; not production.
- Operator: authenticated Style.re sandbox `acct_1RAkm8PvdPuIlEw5`; no TRAINR parent/trainer account used.
- Endpoint: `https://trainr-git-codex-payment-readiness-20261006-styleres-projects.vercel.app/api/payments/webhook`.
- Destination: `we_1UOVC2PvdPuIlEw5lmUAZkMN`, platform payments, snapshot API `2025-03-31.basil`.
- Result: **PASS for provider-backed platform webhook ingress only**. Full booking, Connect, payout and production signoff remain **HOLD**.

## Exact Steps And Results

1. Reopened Stripe sandbox Workbench after its earlier loading failures. Verified the platform destination is active and initially has zero deliveries.
2. Inspected Send test events. It directs operators to the Stripe CLI. Ran `stripe trigger --help` in the dashboard's sandbox-only Stripe Shell and confirmed the supported trigger and fixture side effects.
3. Reviewed the deployed webhook source: a payment intent without `metadata.bookingId` is acknowledged without applying booking/payment evidence. No TRAINR metadata was supplied to the fixture.
4. Ran `stripe trigger payment_intent.succeeded` exactly once. The first Enter attempt did not submit because autocomplete changed the textbox; selected the explicit suggestion and then submitted. Shell returned `Set up fixture for: payment_intent` and `Trigger succeeded!`.
5. Opened Event deliveries and inspected both delivered events. Expected: signed provider events reach the application and return HTTP 200. Actual: both **Delivered / 200 OK**, response `{"received":true}`.

| Event | Event ID | Delivery time (UTC) | Result |
| --- | --- | --- | --- |
| `payment_intent.succeeded` | `evt_3UPCo1PvdPuIlEw51BSxH0SA` | 2026-10-11 02:48:11 | PASS: HTTP 200, received true |
| `charge.updated` (fixture side effect) | `evt_3UPCo1PvdPuIlEw51x4TcN8a` | 2026-10-11 02:48:13 | PASS: HTTP 200, received true |

The primary delivery attempt is `wc_1UPCo3PvdPuIlEw5hAzklOZc`. The synthetic fixture created test-mode Stripe payment objects, including a USD 20 test charge; this was not a parent Checkout or a trainer destination charge, and no real funds moved. No raw payload, client secret or signing secret is included in this report.

## Independent Persistence Check

Reran the existing read-only Neon catalog/count query against `trainr-audit-staging-20261009` after the trigger. Completed in 1332 ms:

```json
{"sports":5,"specialties":32,"users":0,"bookings":0,"payments":0,"sports_digest":"c10665f04b5d1353ad538af2a494053c","specialties_digest":"7900749967ae00ddabfc6f60ec6a1f93"}
```

Expected and actual: unrelated synthetic Stripe events do not create TRAINR users, bookings or payments; reference catalog fingerprints remain unchanged. **PASS for this narrow negative-write assertion**, not booking persistence proof.

## Blockers, Fix Status And Limits

- The owner-approved single-domain protection exception was saved in the preceding pass. These successful provider deliveries now prove Stripe can reach that endpoint despite the in-app browser's separate `ERR_BLOCKED_BY_CLIENT` on `/api/health`.
- Platform signing-secret configuration and deployed signature verification accepted actual Stripe delivery at the configured snapshot version. This does not validate every event schema or the separate Connect signing secret.
- Preview `NEXTAUTH_SECRET` remained absent in the immediately preceding settings check: only Production had that key, Shared had no result. Owner entry/save in the prepared audit-branch-only form is still required; no production credential was copied.
- No application code change was necessary for these two deliveries. This is a settings/provider retest, not a new unit or browser suite run.
- TRAINR-originated parent Checkout, trainer Connect onboarding, connected-account event delivery, destination transfers, fees, real booking/payment persistence and payout status remain unverified. No main merge or production promotion occurred.

