// ============================================
// BUILD LOOP 2: ARCHITECTURE & SYSTEM DESIGN
// ============================================

# Trainr — Architecture Document

## 1. System Overview
```
┌─────────────────────────────────────────────────┐
│                    Vercel                        │
│              Next.js App Router                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │  Public   │ │   Auth   │ │   Dashboard      │ │
│  │  Pages    │ │  System  │ │  (T/P/A)         │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
│  ┌──────────────────────────────────────────────┐│
│  │              API Routes                      ││
│  │  /api/trainers /api/bookings /api/payments   ││
│  │  /api/messages /api/reviews /api/admin       ││
│  │  /api/search /api/upload /api/onboarding     ││
│  │  /api/webhooks/stripe                        ││
│  └──────────────────────────────────────────────┘│
└─────────────────────────────────────────────────┘
           │              │              │
    ┌──────┴──────┐ ┌─────┴─────┐ ┌─────┴──────┐
    │ PostgreSQL   │ │  Stripe   │ │   Resend   │
    │ (Prisma ORM) │ │ Connect   │ │  (Email)   │
    └─────────────┘ └───────────┘ └────────────┘
```

## 2. Tech Stack Details
- **Framework**: Next.js 15 (App Router, Server Components, Server Actions)
- **Database**: PostgreSQL via Prisma ORM
- **Auth**: NextAuth.js (Credentials provider + email verification)
- **Payments**: Stripe Connect (Standard accounts for trainers)
- **UI**: Tailwind CSS + shadcn/ui + Radix primitives
- **Forms**: react-hook-form + zod validation
- **Email**: Resend (transactional emails)
- **Deployment**: Vercel (frontend + API) + managed PostgreSQL

## 3. Database Schema
See prisma/schema.prisma for full schema.

### Key Design Decisions
- **Soft deletes**: Never hard-delete bookings or payments
- **Money as cents**: All monetary values stored as integers (cents)
- **JSONB for flexible data**: Notification.data, AdminAction.metadata
- **Indexing strategy**: Composite indexes on frequently queried columns
- **Optimistic concurrency**: Version fields on Booking for concurrent updates

## 4. API Contracts

### Authentication
```
POST /api/auth/signup          → { user, token }
POST /api/auth/signin          → { user, token }
POST /api/auth/verify-email    → { success }
POST /api/auth/forgot-password → { success }
POST /api/auth/reset-password  → { success }
```

### Trainers
```
GET    /api/trainers           → TrainerProfile[] (paginated, filtered)
GET    /api/trainers/:slug     → TrainerProfile (full detail)
GET    /api/trainers/me        → Current trainer profile
PUT    /api/trainers/me        → Update trainer profile
GET    /api/trainers/me/availability → AvailabilitySlot[]
PUT    /api/trainers/me/availability → Update availability
GET    /api/trainers/me/services     → ServiceOffering[]
POST   /api/trainers/me/services     → Create service offering
PUT    /api/trainers/me/services/:id → Update service offering
DELETE /api/trainers/me/services/:id → Delete service offering
GET    /api/trainers/me/packages     → Package[]
POST   /api/trainers/me/packages     → Create package
PUT    /api/trainers/me/packages/:id → Update package
```

### Search
```
GET /api/search?sport=&specialty=&priceMin=&priceMax=&rating=&location=&page= → { results, total, page }
```

### Bookings
```
GET    /api/bookings           → Booking[] (filtered by role)
POST   /api/bookings           → Create booking + payment intent
GET    /api/bookings/:id       → Booking detail
PUT    /api/bookings/:id       → Update booking (reschedule)
PUT    /api/bookings/:id/cancel → Cancel booking
PUT    /api/bookings/:id/complete → Mark complete (trainer)
```

### Payments
```
POST   /api/payments/create-intent → { clientSecret, bookingId }
POST   /api/payments/confirm       → { success }
POST   /api/payments/refund/:id    → { refund }
GET    /api/payments/history       → Payment[] (filtered by role)
POST   /api/payments/stripe-onboard → { url } (Stripe Connect onboarding)
GET    /api/payments/stripe-status  → { chargesEnabled, detailsSubmitted }
```

### Messages
```
GET    /api/messages/threads        → MessageThread[]
GET    /api/messages/threads/:id    → MessageThread + Messages
POST   /api/messages/threads        → Create or get thread
POST   /api/messages/threads/:id    → Send message
PUT    /api/messages/:id/read       → Mark as read
```

### Reviews
```
POST   /api/reviews                → Create review
GET    /api/reviews/trainer/:id    → Review[] (for trainer)
PUT    /api/reviews/:id            → Update review
POST   /api/reviews/:id/respond    → Trainer response
```

### Admin
```
GET    /api/admin/trainers/pending → TrainerProfile[] (pending approval)
PUT    /api/admin/trainers/:id/approve → Approve trainer
PUT    /api/admin/trainers/:id/reject  → Reject trainer
GET    /api/admin/analytics        → Dashboard metrics
GET    /api/admin/bookings         → All bookings (filtered)
GET    /api/admin/payments         → All payments
GET    /api/admin/reports          → ModerationReport[]
PUT    /api/admin/reports/:id      → Resolve report
GET    /api/admin/fee-config       → FeeConfig[]
PUT    /api/admin/fee-config       → Update fee config
```

### Webhooks
```
POST /api/webhooks/stripe → Handle Stripe events
```

## 5. Authentication Flow
1. NextAuth CredentialsProvider with custom authorize()
2. Password hashed with bcryptjs (salt rounds: 12)
3. JWT-based sessions (no database sessions for performance)
4. Role-based middleware on API routes
5. Email verification token with 24h expiry
6. Password reset with secure token

## 6. Stripe Connect Flow
1. Trainer creates profile → admin approves
2. Trainer clicks "Set up payments" → redirects to Stripe Connect onboarding
3. Platform creates Standard connected account
4. Trainer completes Stripe onboarding (identity, bank info)
5. Platform verifies chargesEnabled
6. On booking: parent pays → Stripe holds funds
7. On session complete: platform transfers (minus 15% commission) to trainer's connected account
8. Payouts happen automatically via Stripe

## 7. File Upload Strategy
- Profile photos, certifications uploaded to S3-compatible storage
- Pre-signed URLs for secure upload
- Image validation: max 5MB, JPEG/PNG only
- Certification documents: max 10MB, PDF/JPEG/PNG
- Thumbnail generation for profile photos

## 8. Security Measures
- CSRF protection via NextAuth
- Rate limiting on API routes (per IP, per user)
- Input validation with zod on all endpoints
- SQL injection prevention via Prisma parameterized queries
- XSS prevention via React's built-in escaping
- Content Security Policy headers
- No PII in URLs (use slugs/IDs)
- Stripe webhook signature verification
- Admin routes require ADMIN role verification
- Session-based messaging (no WebRTC/external channels)

## 9. Performance Strategy
- Server Components for data fetching (no client-side waterfalls)
- Streaming for heavy pages
- Image optimization via next/image
- Database connection pooling
- Indexed queries for search
- Pagination on all list endpoints
- Caching for sport/specialty data
- Lazy loading for dashboard widgets

## 10. Deployment Architecture
- **Vercel**: Next.js app (auto-deploy from main branch)
- **Neon/Supabase**: Managed PostgreSQL
- **Stripe**: Production mode with webhook endpoint
- **Resend**: Transactional email (domain verified)
- **Environment variables**: Managed via Vercel Environment Variables
