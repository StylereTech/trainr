# Trainr — Youth Sports Training Marketplace

> Connect parents with vetted, qualified sports trainers for football, baseball, basketball, soccer, and track & field. Book sessions, track progress, and help your athlete excel.

## 🏋️ Overview

Trainr is a two-sided marketplace platform where:
- **Parents** find and book vetted sports trainers for their young athletes
- **Trainers** list services, manage bookings, and earn income
- **Admins** manage the platform, approve trainers, and monitor activity

## 🛠 Tech Stack

- **Frontend:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS
- **UI:** shadcn/ui (Radix primitives), Lucide icons
- **Backend:** Next.js API Routes, Prisma ORM
- **Database:** PostgreSQL
- **Auth:** NextAuth.js v4 (credentials, JWT sessions)
- **Payments:** Stripe Connect (marketplace with automatic splits)
- **Validation:** Zod
- **Testing:** Vitest

## 📁 Project Structure

```
trainr/
├── prisma/
│   ├── schema.prisma          # Database schema (35+ models)
│   └── seed.ts                # Seed script with realistic data
├── src/
│   ├── app/
│   │   ├── admin/             # Admin dashboard (9 pages)
│   │   ├── auth/              # Sign in / Sign up
│   │   ├── book/              # Booking flow
│   │   ├── browse/            # Browse trainers
│   │   ├── parent/            # Parent dashboard & athletes
│   │   ├── trainer/           # Trainer dashboard, profile, onboarding
│   │   ├── api/               # API routes
│   │   │   ├── admin/         # Admin API (trainers, users, bookings, payouts, disputes, settings, coupons)
│   │   │   ├── auth/          # NextAuth + register
│   │   │   ├── athletes/      # Athlete CRUD
│   │   │   ├── bookings/      # Booking CRUD + status management
│   │   │   ├── coupons/       # Coupon validation
│   │   │   ├── messages/      # Messaging
│   │   │   ├── notifications/ # Notifications
│   │   │   ├── payments/      # Stripe checkout, webhook, Connect onboarding
│   │   │   ├── reviews/       # Review CRUD
│   │   │   ├── search/        # Search with filters
│   │   │   └── trainers/      # Trainer listing & profiles
│   │   └── ...                # Public pages (about, FAQ, contact, sports, etc.)
│   ├── components/
│   │   ├── ui/                # 18 shadcn/ui components
│   │   ├── layout/            # Navbar, Footer
│   │   ├── providers/         # AuthProvider
│   │   └── shared/            # TrainerCard, StarRating
│   ├── lib/
│   │   ├── prisma.ts          # Prisma client singleton
│   │   ├── stripe.ts          # Stripe helpers
│   │   ├── utils.ts           # Utility functions + constants
│   │   └── validations.ts     # Zod schemas
│   └── types/                 # TypeScript type augmentations
├── tests/                     # Vitest test suites
│   ├── api.test.ts            # Booking flow, search, coupon, payment tests
│   ├── utils.test.ts          # Utility function tests
│   └── validations.test.ts    # Zod schema validation tests
└── docs/
    ├── product-spec.md        # Product specification
    └── architecture.md        # Technical architecture
```

## 🚀 Quick Start

### Prerequisites

- Node.js 22+
- PostgreSQL database
- Stripe account (for payments)

### Setup

```bash
# 1. Clone and install
git clone <repo-url> trainr && cd trainr
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env with your database URL, Stripe keys, etc.

# 3. Set up database
npx prisma migrate dev --name init
# or: npx prisma db push

# 4. Seed with sample data
npm run db:seed

# 5. Start dev server
npm run dev
```

### Environment Variables

```env
DATABASE_URL="postgresql://user:password@localhost:5432/trainr"
NEXTAUTH_SECRET="your-secret-here"
NEXTAUTH_URL="http://localhost:3000"
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."
```

## 🎭 Demo Accounts

After seeding, use these accounts:

| Role     | Email                        | Password      |
|----------|------------------------------|---------------|
| Admin    | admin@trainr.app             | Admin123!     |
| Trainer  | marcus.johnson@email.com     | Trainer123!   |
| Trainer  | tyrone.jackson@email.com     | Trainer123!   |
| Parent   | jennifer.davis@email.com     | Parent123!    |
| Parent   | robert.smith@email.com       | Parent123!    |

## 🏈 Sports Supported

| Sport          | Icon | Specialties |
|----------------|------|-------------|
| Football       | 🏈   | QB, WR, RB, DB, OL, DL, Kicking, Speed & Agility |
| Baseball       | ⚾   | Hitting, Pitching, Catching, Fielding, Strength, Throwing |
| Basketball     | 🏀   | Shooting, Ball Handling, Footwork, Defense, Post Play, Guard Play |
| Soccer         | ⚽   | Striker, Midfield, Defense, Goalie, Ball Control, Conditioning |
| Track & Field  | 🏃   | Sprinting, Hurdles, Distance, Jumps, Throws, Starts & Form |

## 💳 Payment Flow

1. Parent books a session → Booking created (PENDING)
2. Parent pays via Stripe Checkout → Payment intent created
3. Stripe processes payment → Webhook confirms booking
4. Platform takes 15% commission → Trainer receives 85%
5. After session completion → Trainer can receive payout

## 🔧 Key Features

### For Parents
- Browse and search trainers by sport, location, rating, price
- View detailed trainer profiles with reviews
- Book individual or group sessions
- Manage athletes and track bookings
- Leave reviews after sessions
- Apply promo codes

### For Trainers
- Complete onboarding profile
- List service offerings with custom pricing
- Set weekly availability
- Manage bookings (confirm, complete, cancel)
- Stripe Connect for automatic payouts
- View earnings dashboard
- Respond to reviews

### For Admins
- Dashboard with platform metrics
- Trainer approval queue
- User management (roles, deletion)
- Booking management
- Payout & revenue tracking
- Dispute moderation
- Fee configuration
- Coupon management
- Analytics

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test file
npx vitest run tests/utils.test.ts

# Run in watch mode
npx vitest
```

## 📝 API Overview

### Public
- `GET /api/trainers` — List approved trainers
- `GET /api/trainers/[slug]` — Trainer profile
- `GET /api/search` — Search with filters (sport, specialty, price, location, rating)
- `POST /api/coupons` — Validate promo code

### Authenticated
- `POST /api/bookings` — Create booking
- `GET /api/bookings` — List user bookings
- `PATCH /api/bookings/[id]` — Update booking status
- `POST /api/reviews/[bookingId]` — Leave review
- `GET/POST /api/messages` — Messaging
- `GET /api/notifications` — Notifications
- `POST /api/payments/checkout` — Start Stripe checkout
- `POST /api/payments/connect` — Trainer Stripe Connect onboarding

### Admin
- `GET /api/admin?view=overview|users|trainers-pending|bookings` — Dashboard data
- `PATCH /api/admin/trainers/[id]` — Approve/reject/suspend trainers
- `GET/PATCH /api/admin/users` — User management
- `GET/PATCH /api/admin/bookings` — Booking management
- `GET /api/admin/payouts` — Revenue & payout data
- `GET/PATCH/POST /api/admin/disputes` — Moderation
- `GET/POST /api/admin/settings` — Fee configuration
- `GET/POST/PATCH /api/admin/coupons` — Coupon management

### Webhooks
- `POST /api/payments/webhook` — Stripe webhook handler

## 🚢 Deployment

```bash
# Build for production
npm run build

# Start production server
npm start
```

Recommended deployment: **Vercel** (frontend + API) + **Supabase/Neon** (PostgreSQL) + **Stripe** (payments).

## 📄 License

Private — All rights reserved.
