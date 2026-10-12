CREATE TABLE "account_checkout_closures" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "outcome" TEXT,
  "sessionId" TEXT,
  "checkedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "account_checkout_closures_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "account_checkout_closures_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "account_checkout_closures_state_valid" CHECK (
    "kind" IN ('BOOKING', 'PACKAGE') AND "status" IN ('PENDING', 'REVIEW', 'CLOSED')
    AND ("status" <> 'CLOSED' OR ("checkedAt" IS NOT NULL AND "sessionId" IS NOT NULL AND "outcome" = 'expired_unpaid')))
);
CREATE UNIQUE INDEX "account_checkout_closures_kind_targetId_key" ON "account_checkout_closures"("kind", "targetId");
CREATE INDEX "account_checkout_closures_status_createdAt_idx" ON "account_checkout_closures"("status", "createdAt");

-- Retain unresolved historical closures for operator review; never infer provider closure.
INSERT INTO "account_checkout_closures" ("id", "userId", "kind", "targetId", "updatedAt")
SELECT 'closure-booking-' || p.id, CASE WHEN pu."deletedAt" IS NOT NULL THEN pu.id ELSE tu.id END, 'BOOKING', p.id, CURRENT_TIMESTAMP
FROM payments p JOIN bookings b ON b.id = p."bookingId"
JOIN parent_profiles pp ON pp.id = b."parentProfileId" JOIN users pu ON pu.id = pp."userId"
JOIN trainer_profiles tp ON tp.id = b."trainerProfileId" JOIN users tu ON tu.id = tp."userId"
WHERE pu."deletedAt" IS NOT NULL OR tu."deletedAt" IS NOT NULL;
INSERT INTO "account_checkout_closures" ("id", "userId", "kind", "targetId", "updatedAt")
SELECT 'closure-package-' || p.id, CASE WHEN pu."deletedAt" IS NOT NULL THEN pu.id ELSE tu.id END, 'PACKAGE', p.id, CURRENT_TIMESTAMP
FROM package_purchases p
JOIN parent_profiles pp ON pp.id = p."parentProfileId" JOIN users pu ON pu.id = pp."userId"
JOIN trainer_profiles tp ON tp.id = p."trainerProfileId" JOIN users tu ON tu.id = tp."userId"
WHERE pu."deletedAt" IS NOT NULL OR tu."deletedAt" IS NOT NULL;
