# Trainr

A Next.js sports trainer marketplace app where parents can find and book sports trainers for their athletes.

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Database**: PostgreSQL via Prisma ORM
- **Auth**: NextAuth.js v4 with Prisma adapter
- **Payments**: Stripe (marketplace with platform fees)
- **Email**: Resend
- **UI**: Tailwind CSS + Radix UI + shadcn/ui components

## Project Structure

- `src/app/` — Next.js App Router pages and API routes
- `src/components/` — Reusable UI components
- `src/lib/` — Utility functions, auth config, Prisma client
- `src/types/` — TypeScript type definitions
- `prisma/` — Prisma schema and seed data

## Running the App

```bash
npm run dev       # Development server on port 5000
npm run build     # Production build (also runs prisma generate)
npm run start     # Production server on port 5000
```

## Environment Variables

Required secrets (set in Replit Secrets):
- `DATABASE_URL` — PostgreSQL connection string (Replit DB auto-configured)
- `NEXTAUTH_SECRET` — Secret for JWT signing (auto-generated for dev)

Optional secrets for full functionality:
- `STRIPE_SECRET_KEY` — Stripe secret key
- `STRIPE_PUBLIC_KEY` / `NEXT_PUBLIC_STRIPE_PUBLIC_KEY` — Stripe public key
- `STRIPE_WEBHOOK_SECRET` — Stripe webhook secret
- `RESEND_API_KEY` — Resend email API key

Non-sensitive config (set as env vars):
- `NEXTAUTH_URL` — App URL (set to Replit dev domain)
- `NEXT_PUBLIC_APP_URL` — Public app URL
- `NEXT_PUBLIC_APP_NAME` — App display name
- `STRIPE_PLATFORM_FEE_PERCENT` — Platform fee % (default: 15)
- `EMAIL_FROM` — Sender email address

## Database

Uses Replit's built-in PostgreSQL. Run these to set up:

```bash
npm run db:push    # Push schema to database
npm run db:seed    # Seed with sample data
```

## Replit Configuration

- Port: 5000 (required for Replit webview)
- Host: 0.0.0.0 (required for Replit proxy)
- `allowedDevOrigins` set to `*.replit.dev` for preview pane compatibility
