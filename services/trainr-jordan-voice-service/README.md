# Trainr Jordan Persistent Voice WebSocket Service

This is the first build layer for the Trainr phone agent: a persistent Twilio voice WebSocket service connected to OpenAI Realtime. It is designed to be dropped into `Digital-ZEL/clawtronics-phone-agent` or used as the replacement voice service for the existing `trainr-jordan-voice-service` Fly app.

## What this builds first

1. Persistent Twilio `<Connect><Stream>` WebSocket endpoint: `/voice/trainr/realtime`
2. OpenAI Realtime speech-to-speech bridge using `gpt-realtime`
3. Live PCMU audio pass-through from Twilio to OpenAI and back
4. Jordan sales/onboarding agent prompt
5. Trainr CRM/profile/payment tool schemas
6. Secure Twilio Pay handoff route
7. Transcript/session persistence with CRM endpoint fallback or local JSONL
8. GitHub Actions Fly deployment workflow using `secrets.FLY_API_TOKEN`
9. Optional ConversationRelay text-mode fallback endpoint

## Why the primary route uses Media Streams + OpenAI Realtime

The primary endpoint is direct:

```text
Trainer phone call
  -> Twilio <Connect><Stream>
  -> /voice/trainr/realtime persistent WebSocket
  -> OpenAI Realtime WebSocket
  -> Trainr tools / CRM / payment handoff
  -> Twilio audio response
```

This is the right first engine because it proves the 20-60 minute real-time sales conversation before buying/configuring the final Trainr number.

## Repo install

This folder is checked into the Trainr repo under `services/trainr-jordan-voice-service/`.

```bash
npm install
cp .env.example .env
npm run check
npm run dev
```

Minimum env values:

```bash
OPENAI_API_KEY=sk-...
PUBLIC_BASE_URL=https://trainr-jordan-voice-service.fly.dev
```

For live payment handoff, also set:

```bash
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TRAINR_PAYMENT_CONNECTOR=Trainr_Stripe
```

## Twilio dev call path

Point a temporary/dev Twilio voice webhook to:

```text
POST https://trainr-jordan-voice-service.fly.dev/voice/trainr/twiml
```

That returns TwiML similar to:

```xml
<Response>
  <Connect>
    <Stream url="wss://trainr-jordan-voice-service.fly.dev/voice/trainr/realtime" name="trainr-jordan" />
  </Connect>
</Response>
```

## Payment safety

Jordan never collects spoken card details. When the trainer agrees to pay, the model calls `start_secure_payment`. The service redirects the active Twilio call to `/voice/trainr/payment-twiml`, which uses Twilio `<Pay>` and the configured payment connector. The AI socket does not process card numbers, CVV, bank account, or routing data.

## Fly deploy

The root workflow at `.github/workflows/deploy-trainr-jordan-voice-service.yml` uses the existing repo secret:

```yaml
FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

It deploys to:

```text
trainr-jordan-voice-service
```

The token is not committed or written to docs.

## Existing CRM integration

If the existing repo already has routes/services for CRM, SMS, profile drafts, or payment links, map these endpoints in `src/agent/tools.js`:

```text
POST /voice/trainr/lookup
POST /voice/trainr/onboarding-progress
POST /voice/trainr/profile-draft
POST /voice/trainr/send-sms
POST /voice/trainr/send-email
POST /voice/trainr/callback
POST /voice/trainr/call-summary
POST /voice/trainr/calls
```

Set:

```bash
TRAINR_CRM_BASE_URL=https://your-existing-crm-or-api
TRAINR_CRM_API_KEY=...
```

If no CRM URL is set, the service writes fallback JSONL files under `data/calls/` for dev testing.

## Jordan sales behavior

The prompt is in:

```text
src/agent/jordanPrompt.js
```

Jordan is built to sell Trainr as a visibility, credibility, portfolio, ratings, and discovery platform for trainers. The agent explains why parents and athletes can find a trainer based on sport, position, skill, location, ratings, and proof instead of the trainer only chasing customers through DMs and referrals.

## Transcript and summary save

The service saves transcript events during the call, redacts possible payment/card data before persistence, and generates a final CRM summary on socket cleanup if Jordan did not already call `end_call_with_summary`.

## Signature validation

Set this only after `PUBLIC_BASE_URL` is correct and Twilio is hitting the deployed public URL:

```bash
TWILIO_VALIDATE_SIGNATURES=true
```

The service validates both HTTP webhooks and Trainr voice WebSocket upgrade requests when this is enabled.

## Migration details

See `docs/repo-migration-plan.md` for the exact reuse plan for the original Clawtronics/Las Palmas phone-agent repo.
