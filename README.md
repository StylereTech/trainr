# Trainr

Youth sports coaching marketplace connecting parents, athletes, and trainers.

- GitHub: https://github.com/StylereTech/trainr
- Production: https://trainr.cc
- Vercel fallback: https://trainr-seven.vercel.app

## Stack

- Next.js 15
- TypeScript
- Prisma + Postgres
- NextAuth
- Stripe Connect
- Playwright + Vitest

## Repo layout

```text
trainr/
├── docs/                  Product, architecture, and runbooks
├── e2e/                   Playwright end-to-end coverage
├── prisma/                Schema and seed/database tooling
├── scripts/               Repo utilities and smoke helpers
├── src/app/               App Router pages and API routes
├── src/components/        Shared UI
├── src/lib/               Core services and utilities
└── tests/                 Vitest coverage
```

## Core commands

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npm run check
npm run test:e2e
npm run test:e2e:prod
```

## Environment

Use `.env.example` as the source of truth for required environment variables.

Minimum production-critical values:

- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `NEXT_PUBLIC_APP_URL`
- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`

## Production readiness

Repo-side status is organized and deployable:

- lintable
- typecheckable
- buildable
- Playwright harness wired to the real production domain by default
- repo docs consolidated for handoff and deployment

Current live business blocker:

- Each trainer still must finish Stripe Connect onboarding on their own connected account before payouts and paid checkout can succeed for that trainer.
- That is a live ops / account-readiness blocker, not a repo-structure blocker.

See `docs/PRODUCTION_READY.md` for the current release/readiness snapshot.

## Docs

- `docs/product-spec.md`
- `docs/architecture.md`
- `docs/DB_READY_RUNBOOK.md`
- `docs/PRODUCTION_READY.md`
