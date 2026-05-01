# Trainr Phone Agent — Jordan

## Purpose
Dedicated Trainr phone onboarding agent for trainers. Jordan qualifies trainers, answers sales questions, builds a structured trainer profile draft, and moves ready trainers into a PCI-safe payment handoff.

## Current implementation
- `POST /api/voice/trainr/twiml` — Twilio voice webhook returning ConversationRelay TwiML.
- `GET|POST /api/voice/trainr/tools` — tool registry + tool execution endpoint for onboarding progress, profile draft creation, and secure Stripe Checkout handoff.
- `POST /api/voice/trainr/payment/twiml` — Twilio `<Pay>` TwiML skeleton for keypad card collection.
- `POST /api/voice/trainr/payment/return` — payment return TwiML.
- `POST /api/voice/trainr/payment/status` — payment status callback capture.
- `scripts/trainr-buy-number.mjs` — Twilio number search/provision script. Default is search-only; `--buy` purchases after approval.
- `scripts/trainr-phone-agent-qa.mjs` — deterministic 100-iteration QA harness.
- `TrainerPhoneLead` Prisma model — stores call/onboarding state, structured JSON, transcript, status, and profile link.

## Required env
```bash
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
NEXT_PUBLIC_APP_URL=https://trainr.cc
TRAINR_VOICE_WS_URL=wss://<conversation-relay-service>/voice/trainr/ws # optional override
TRAINR_VOICE_TOOL_SECRET=... # recommended for tool calls
TRAINR_TWILIO_PAY_CONNECTOR=Trainr_Stripe
TRAINR_FOUNDING_LISTING_AMOUNT=99.00
```

## Number setup
Search only:
```bash
TRAINR_AREA_CODE=214 node scripts/trainr-buy-number.mjs
```

Buy after approval:
```bash
TRAINR_AREA_CODE=214 node scripts/trainr-buy-number.mjs --buy
```

## Production safety rules
- Do not collect card numbers conversationally.
- Use Twilio `<Pay>` or Stripe Checkout handoff only.
- Keep PCI data out of ConversationRelay greetings, hints, parameters, handoff data, logs, and summaries.
- Disclose AI and recording at call start.
- Never guarantee income, clients, scholarships, rankings, or athlete outcomes.
- Escalate legal/tax/medical/payment disputes/custom enterprise requests to a human.

## Next production step
Vercel/Next routes can return TwiML and handle tools, but production real-time WebSocket voice should run on a long-lived Node service if ConversationRelay/OpenAI Realtime requires persistent sockets. Point `TRAINR_VOICE_WS_URL` to that service.

## Persistent WebSocket service package
Ry provided a Trainr Jordan voice-service package on May 1. It has been integrated under:

```text
services/trainr-jordan-voice-service/
```

Local verification:

```bash
cd services/trainr-jordan-voice-service
npm install
npm run check
```

The service exposes:
- `POST /voice/trainr/twiml` — Twilio Media Streams TwiML.
- `WS /voice/trainr/realtime` — persistent Twilio Media Streams ↔ OpenAI Realtime bridge.
- `POST /voice/trainr/payment-twiml` — Twilio Pay handoff.
- `WS /voice/trainr/conversation-relay` — optional ConversationRelay fallback.

Deployment is intentionally manual via `.github/workflows/deploy-trainr-jordan-voice-service.yml` so we do not overwrite the existing Clawtronics/Las Palmas phone app by accident.
