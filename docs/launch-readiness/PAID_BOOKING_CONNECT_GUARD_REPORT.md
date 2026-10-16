# Paid Booking Connect Guard Report

- Date/time: 2026-10-16 08:54 UTC (01:54 America/Los_Angeles).
- Environment: local Windows audit checkout with synthetic, unreachable database and Stripe environment values for build; Vercel TRAINR Preview only for read-only smoke. Production and main were not changed.
- Source commit: `e1765b79f12c97e80bbae66377d8109a15614614` on `codex/payment-readiness-20261006`.
- Deployment: [Vercel Preview](https://vercel.com/styleres-projects/trainr/3veKLeiqLDG1iNPqajhehy8KPozk), independently observed Ready. Immutable URL: `https://trainr-qfqcpxi2x-styleres-projects.vercel.app/`.
- Accounts/data: no credentials or private records used in local tests. Public Preview catalog displayed the already-approved synthetic `Audit Trainer` profile. No new booking, payment, refund, transfer, or payout was submitted.

## Finding And Fix

`POST /api/bookings` could commit a paid, pending reservation and consume a coupon even when the trainer's saved Stripe Connect state was known to be unready. The subsequent `POST /api/payments/checkout` independently checks fresh Stripe readiness and would reject checkout, leaving an unpaid booking occupying a slot. `createBooking` now checks the saved account ID and onboarding-complete flag inside the reservation transaction, after the accepted price is checked and before coupon usage or booking writes. A paid request returns HTTP 409 when either is absent. Exact replay of an already committed request retains its prior idempotent behavior. Zero-due bookings remain independent of Connect; checkout still performs the fresh provider check, so this guard is not proof that an account is presently eligible.

## Steps And Results

| Step / route | Expected | Actual | Result |
| --- | --- | --- | --- |
| Local `createBooking` with paid service, missing Connect account or incomplete onboarding; `POST /api/bookings` maps the domain error | HTTP 409; no booking, request ledger, notification, or coupon usage | Two focused cases assert the 409 and zero writes; route already maps `BookingCreationError` to its status | PASS locally; no hosted mutation attempted |
| Local zero-due `createBooking` with no Connect account | Confirmed free booking, no Stripe dependency | Focused regression passed | PASS locally |
| Focused `npm test -- tests/booking-creation.test.ts tests/booking-post.test.ts` | All pass | 70/70 passed after final edit | PASS |
| Full `npm run check` | Lint, typecheck, unit and build pass | Lint 0 errors / 42 existing warnings; typecheck passed; first unit run timed out in two unrelated esbuild security tests (1,783 passed, 2 failed), so build did not run in that command | FAIL first run, retested |
| Isolated `npm test -- tests/esbuild-security.test.ts`; fresh full `npm test`; `npm run build` | Rule out repeatable regression; complete quality gate | 5/5, then 1,785/1,785 across 82 files; production build exited 0 and generated 84 static pages | PASS on retest; timeout root cause remains unproven |
| Preview `/`, `/browse` | Deployment responds; approved synthetic catalog remains visible | Browser rendered homepage, unfiltered catalog showed 1 trainer and `Audit Trainer` profile link | PASS read-only smoke |
| Hosted parent `Book & Pay` -> booking -> Stripe Checkout -> webhook | Paid reservation and full provider receipt chain | Not run: browser financial action is awaiting user handoff; trainer sandbox Connect account remains restricted | BLOCKED, not claimed |

## Open Gates

The Preview build is Ready, but hosted write-path proof for this guard and the complete parent/trainer money flow is still pending. The sandbox trainer account must finish Stripe Connect onboarding; the user must initiate the prepared parent Book & Pay action. Verify the booking and coupon state before and after that action, signed webhook persistence, destination transfer, trainer balances and payout evidence. Do not treat a Stripe account link or a checkout URL as payment or bank-payout proof.

Published refund-policy promises still exceed implementation: cash cancellation triggers review and does not submit the advertised refund or trainer late-cancellation credit. The exact 24-hour boundary and credit semantics need owner-approved rules and an end-to-end refund design. CI jobs have also been blocked before starting by GitHub account billing. Production signoff remains **HOLD**.
