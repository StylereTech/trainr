# Repo migration plan for `Digital-ZEL/clawtronics-phone-agent`

This service is designed to reuse the existing Clawtronics/Las Palmas phone-agent foundation instead of starting from scratch.

## Reuse from the original repo

When the repo is available, map these pieces from the current system into this Trainr service:

1. Existing Express/Fastify app bootstrap and health routes.
2. Existing Twilio webhook validation middleware.
3. Existing Fly app configuration for `clawtronics-las-palmas-demo`.
4. Existing logging/error handling conventions.
5. Existing phone-call persistence, transcript storage, or CRM write paths.
6. Existing SMS/email utilities used by Clawtrone/restaurants.
7. Existing payment or Stripe connector configuration, if already present.
8. Existing GitHub Actions deployment workflow; keep using `secrets.FLY_API_TOKEN` only.

## Replace or add for Trainr

1. Add the `/voice/trainr/twiml` route.
2. Add the persistent `/voice/trainr/realtime` WebSocket route.
3. Add Jordan's Trainr sales prompt from `src/agent/jordanPrompt.js`.
4. Add Trainr-specific tool schemas and CRM adapters from `src/agent/tools.js`.
5. Add the secure payment TwiML route from `src/routes/payment.js`.
6. Keep card collection outside the AI conversation using Twilio Pay.

## Primary transport

Use Twilio Media Streams + OpenAI Realtime as the primary route:

```text
Twilio Call -> <Connect><Stream> -> /voice/trainr/realtime -> OpenAI Realtime -> Trainr tools -> Twilio audio
```

Keep ConversationRelay as a fallback/dev path if the existing repo already uses it.

## Deploy sequence

1. Merge these files into the repo.
2. Set Fly secrets for runtime keys with `flyctl secrets set` or the Fly dashboard.
3. Run GitHub Actions deploy using the existing `FLY_API_TOKEN` repo secret.
4. Point a temporary/dev Twilio webhook to `/voice/trainr/twiml`.
5. Test a full 20-60 minute onboarding conversation.
6. Buy/configure the final Trainr Twilio number only after the socket proves stable.
