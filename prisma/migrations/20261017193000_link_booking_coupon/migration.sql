ALTER TABLE "bookings" ADD COLUMN "couponId" TEXT;

CREATE INDEX "bookings_couponId_idx" ON "bookings"("couponId");

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_couponId_fkey"
  FOREIGN KEY ("couponId") REFERENCES "coupons"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
