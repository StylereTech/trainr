// ============================================
// BUILD LOOP 1: PRODUCT SPECIFICATION (PRD)
// ============================================
// Trainr — Youth Sports Trainer Marketplace
// Full Product Requirements Document

# Trainr — Product Specification (PRD)

## 1. Product Vision
Trainr is a two-sided marketplace connecting parents of youth athletes with vetted, qualified sports trainers across 5 sports: Football, Baseball, Basketball, Soccer, and Track & Field. We make it dead simple for parents to find, book, and pay for quality training — and give trainers a platform to build their business.

## 2. Target Users
- **Parents/Guardians**: Seeking quality coaching for their children (ages 5-18)
- **Trainers/Coaches**: Independent coaches wanting to build their client base
- **Admin**: Platform operators managing quality, safety, and operations

## 3. Core Value Props
- **For Parents**: Find trusted trainers, book instantly, pay securely, track progress
- **For Trainers**: Get discovered, manage bookings, get paid automatically, build reputation
- **For Platform**: Marketplace commission (15%) on every booking

## 4. User Flows

### 4.1 Trainer Onboarding
1. Sign up with email/password → email verification
2. Complete profile: name, photo, bio, sports, specialties, certifications
3. Set pricing: individual session rates, package deals
4. Set availability: weekly schedule, blackout dates
5. Set service area: location type (in-person, virtual, both)
6. Upload credentials: certifications, background check
7. Submit for admin approval
8. Admin reviews → approves/rejects with feedback
9. Upon approval: Stripe Connect onboarding → start receiving bookings

### 4.2 Parent Onboarding
1. Sign up with email/password → email verification
2. Complete profile: name, phone, location
3. Add athlete profiles: name, age, sport interests, skill level, goals
4. Start browsing trainers

### 4.3 Booking Flow
1. Parent searches/browses trainers
2. Filters by sport, specialty, price, location, rating
3. Views trainer profile: bio, specialties, reviews, availability
4. Selects service offering (single session or package)
5. Picks date/time from available slots
6. Adds athlete(s) for the session
7. Reviews booking details + price
8. Pays via Stripe (platform holds, pays trainer minus commission)
9. Both parties receive confirmation
10. Reminder notifications (24h, 1h before)
11. Session occurs
12. Parent prompted to review
13. Trainer marks session complete
14. Payment released to trainer

### 4.4 Messaging
1. Parent can message trainer before booking (inquiry)
2. Messages are threaded per trainer-parent pair
3. Booking-linked messages (contextual)
4. No external contact sharing (safety)
5. Admin can moderate messages

### 4.5 Reviews
1. After session completion, parent gets review prompt
2. Rate 1-5 stars across dimensions: knowledge, communication, punctuality, overall
3. Written review (optional, max 500 chars)
4. Trainer can respond to review
5. Reviews visible on trainer profile
6. Aggregate ratings calculated

### 4.6 Admin Operations
1. Review trainer applications (approve/reject)
2. Handle moderation reports
3. Manage disputes/refunds
4. Configure platform fees
5. View analytics dashboard
6. Manage sports/specialties
7. Send platform announcements

## 5. Entities & Relationships

### User
- id, email, passwordHash, role (PARENT|TRAINER|ADMIN), emailVerified, createdAt, updatedAt
- Has one ParentProfile or TrainerProfile
- Has many Notifications

### ParentProfile
- id, userId, phone, address, city, state, zipCode
- Has many AthleteProfiles
- Has many Bookings (as parent)
- Has many Reviews
- Has many Favorites

### TrainerProfile
- id, userId, firstName, lastName, slug (unique URL), headline, bio, phone
- sports: Sport[] (multi-select)
- specialties: Specialty[] (multi-select)
- certifications: string[]
- yearsExperience: number
- approvalStatus: PENDING|APPROVED|REJECTED|SUSPENDED
- approvedAt, rejectedReason
- avgRating, totalReviews, totalSessions
- locationType: IN_PERSON|VIRTUAL|BOTH
- address, city, state, zipCode, travelRadius
- stripeAccountId, stripeOnboardingComplete
- completionPercentage (profile completeness)
- Has many ServiceOfferings
- Has many AvailabilitySlots
- Has many Packages
- Has many Bookings (as trainer)
- Has many Reviews (received)
- Has many UploadedAssets

### AthleteProfile
- id, parentProfileId, firstName, lastName, dateOfBirth, gender
- sportInterests: Sport[]
- skillLevel: BEGINNER|INTERMEDIATE|ADVANCED
- goals: string[]
- notes: string

### Sport
- id, name, slug, icon, description, order
- Has many Specialties

### Specialty
- id, sportId, name, slug, description

### ServiceOffering
- id, trainerProfileId, sportId, title, description, durationMinutes
- priceInCents, type: INDIVIDUAL|GROUP|VIRTUAL
- isActive, maxParticipants

### Package
- id, trainerProfileId, title, description, totalSessions, priceInCents
- validForDays, isActive
- Has many ServiceOfferings (via PackageItem)

### AvailabilitySlot
- id, trainerProfileId, dayOfWeek, startTime, endTime
- isRecurring, specificDate, isAvailable

### Booking
- id, parentProfileId, trainerProfileId, athleteProfileId, serviceOfferingId
- packageId (nullable), packageSessionNumber
- date, startTime, endTime
- status: PENDING|CONFIRMED|COMPLETED|CANCELLED|NO_SHOW|RESCHEDULED
- location: address or "virtual" or custom
- notes, cancellationReason, rescheduledFromId
- totalAmountInCents, platformFeeInCents, trainerPayoutInCents
- Has one Payment
- Has one Review (optional)

### Payment
- id, bookingId, stripePaymentIntentId, stripeChargeId
- amountInCents, platformFeeInCents, trainerPayoutInCents
- status: PENDING|PROCESSING|SUCCEEDED|FAILED|REFUNDED|PARTIALLY_REFUNDED
- refundAmountInCents, refundReason
- createdAt

### MessageThread
- id, participantAId (parent), participantBId (trainer)
- lastMessageAt, isActive
- Has many Messages

### Message
- id, threadId, senderId, content, bookingId (nullable)
- readAt, isSystemMessage, isFlagged

### Review
- id, bookingId, trainerProfileId, parentProfileId
- rating (1-5), knowledgeRating, communicationRating, punctualityRating
- comment, trainerResponse, trainerResponseAt
- isPublished, flaggedAt, flagReason

### Favorite
- id, parentProfileId, trainerProfileId

### Notification
- id, userId, type, title, message, data (JSON), readAt

### Coupon
- id, code, discountPercent, discountAmountInCents, maxUses, currentUses
- expiresAt, isActive, applicableSportId (nullable)
- createdById (admin)

### ModerationReport
- id, reporterId, reportedUserId, entityType, entityId
- reason, description, status: OPEN|REVIEWING|RESOLVED|DISMISSED
- resolvedBy, resolution, resolvedAt

### AdminAction
- id, adminUserId, actionType, targetType, targetId
- description, metadata (JSON), createdAt

### FeeConfig
- id, platformCommissionPercent, stripeFeePercent, minBookingAmountCents
- processingFeeCents, isActive, effectiveDate

### UploadedAsset
- id, userId, trainerProfileId, url, type (PHOTO|CERTIFICATION|BACKGROUND_CHECK|VIDEO)
- isVerified, uploadedAt

## 6. Edge Cases
- Trainer goes offline during booking flow → save as draft
- Payment fails → retry logic, notify both parties
- Double booking same slot → optimistic locking
- Review bombing → admin can hide reviews, flag accounts
- Trainer rejects booking → full refund, suggest alternatives
- Package sessions can be rescheduled up to 2 times
- Cancel within 24h → 50% charge; within 2h → full charge
- Trainer suspended mid-package → prorated refund
- Messaging rate limiting → prevent spam
- Background check expires → trainer flagged, suspended

## 7. Pricing Model
- Platform commission: 15% of booking total
- Stripe processing: passed through to customer (~2.9% + 30¢)
- Trainer sets their own session rates
- Minimum session price: $15
- Packages: trainers offer bulk discounts (e.g., 10 sessions for price of 8)

## 8. Success Metrics
- Monthly Active Parents (MAP)
- Monthly Active Trainers (MAT)
- Booking conversion rate
- Average sessions per athlete per month
- Trainer retention rate
- Net Promoter Score (NPS)
- Platform revenue (commission)
