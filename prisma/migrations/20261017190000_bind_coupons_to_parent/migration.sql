ALTER TABLE "coupons" ADD COLUMN "recipientParentProfileId" TEXT;

CREATE INDEX "coupons_recipientParentProfileId_idx" ON "coupons"("recipientParentProfileId");

ALTER TABLE "coupons" ADD CONSTRAINT "coupons_recipientParentProfileId_fkey"
  FOREIGN KEY ("recipientParentProfileId") REFERENCES "parent_profiles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
