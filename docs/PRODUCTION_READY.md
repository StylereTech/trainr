# Trainr Production Readiness

## Canonical repo

- GitHub: https://github.com/StylereTech/trainr
- Primary domain: https://trainr.cc
- Vercel project: `trainr`

## What is production-ready now

### Repo hygiene
- Root temp probe files removed from normal workflow
- README upgraded from stub to a real operator-facing entrypoint
- ESLint config added so lint is non-interactive
- Scripts normalized for lint, typecheck, build, Vitest, and Playwright
- Playwright production smoke target defaults to `https://trainr.cc`

### Code / deployment surface
- Prisma schema aligned with live payment retry flow
- Build path verified
- TypeScript path verified
- Stripe Connect retry-related checkout fix already shipped live

## Verification commands

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e:prod
```

## Current live blocker

Trainr is code-ready for Stripe Connect, but trainer payouts are still dependent on each connected trainer account completing Stripe onboarding.

For a trainer account to accept payout-backed checkout, Stripe still requires the connected account owner to complete items like:

- external bank account
- Stripe ToS acceptance
- any remaining KYC / Express onboarding fields

That means:

- the platform integration can be healthy,
- the repo can be production-ready,
- and checkout can still fail for a specific trainer until that trainer finishes onboarding.

## Release posture

Use this repo as the canonical Trainr production source.

Repo truth:
- organized
- documented
- deployable
- testable

Live business truth:
- full paid flow depends on connected-account completion per trainer.
