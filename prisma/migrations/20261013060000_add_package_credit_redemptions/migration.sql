CREATE TABLE "package_credit_redemptions" (
  "bookingId" TEXT NOT NULL PRIMARY KEY,
  "purchaseId" TEXT NOT NULL,
  "serviceOfferingId" TEXT NOT NULL,
  "redeemedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "restoredAt" TIMESTAMPTZ(3),
  "restoredByUserId" TEXT,
  "restorationReason" TEXT,
  CONSTRAINT "package_credit_redemptions_bookingId_fkey" FOREIGN KEY ("bookingId")
    REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "package_credit_redemptions_purchaseId_serviceOfferingId_fkey"
    FOREIGN KEY ("purchaseId", "serviceOfferingId") REFERENCES "package_credit_grants"("purchaseId", "serviceOfferingId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "package_credit_redemptions_restoration_valid" CHECK (
    ("restoredAt" IS NULL AND "restoredByUserId" IS NULL AND "restorationReason" IS NULL) OR
    ("restoredAt" IS NOT NULL AND "restoredAt" >= "redeemedAt" AND "restoredByUserId" IS NOT NULL
      AND "restorationReason" IS NOT NULL AND "restorationReason" IN ('TRAINER_CANCELLATION', 'EARLY_PARENT_CANCELLATION')))
);
CREATE INDEX "package_credit_redemptions_purchaseId_serviceOfferingId_res_idx"
  ON "package_credit_redemptions"("purchaseId", "serviceOfferingId", "restoredAt");

CREATE FUNCTION protect_package_credit_redemption() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  purchase "package_purchases"%ROWTYPE;
  session "bookings"%ROWTYPE;
  service "service_offerings"%ROWTYPE;
  paid_at timestamptz;
  expires_at timestamptz;
  quantity integer;
  used bigint;
  item jsonb;
  checked_at timestamptz(3);
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM "bookings" WHERE id = OLD."bookingId") THEN
      RAISE EXCEPTION 'Credit consumption history cannot be deleted independently';
    END IF;
    RETURN OLD;
  END IF;

  -- The purchase lock serializes spending and restoration across all siblings.
  SELECT * INTO purchase FROM "package_purchases" WHERE id = NEW."purchaseId" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Package purchase not found'; END IF;
  -- A version change also forces stale repeatable-read transactions to retry.
  UPDATE "package_purchases" SET "updatedAt" = clock_timestamp() AT TIME ZONE 'UTC' WHERE id = purchase.id;
  SELECT * INTO session FROM "bookings" WHERE id = NEW."bookingId" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  checked_at := clock_timestamp();

  IF TG_OP = 'UPDATE' THEN
    IF ROW(NEW."bookingId", NEW."purchaseId", NEW."serviceOfferingId", NEW."redeemedAt") IS DISTINCT FROM
      ROW(OLD."bookingId", OLD."purchaseId", OLD."serviceOfferingId", OLD."redeemedAt")
      OR OLD."restoredAt" IS NOT NULL OR NEW."restoredAt" IS NULL
      OR session.status <> 'CANCELLED' THEN
      RAISE EXCEPTION 'Only one cancellation restoration may amend credit history';
    END IF;
    IF NEW."restorationReason" = 'TRAINER_CANCELLATION' THEN
      IF NOT EXISTS (SELECT 1 FROM "trainer_profiles" p JOIN users u ON u.id = p."userId"
        WHERE p.id = session."trainerProfileId" AND u.id = NEW."restoredByUserId" AND u.role = 'TRAINER' AND u."deletedAt" IS NULL) THEN
        RAISE EXCEPTION 'Only the owning trainer can restore a trainer cancellation';
      END IF;
    ELSIF NEW."restorationReason" = 'EARLY_PARENT_CANCELLATION' THEN
      IF session."startsAt" IS NULL OR session."startsAt" < checked_at + interval '24 hours'
        OR NOT EXISTS (SELECT 1 FROM "parent_profiles" p JOIN users u ON u.id = p."userId"
          WHERE p.id = session."parentProfileId" AND u.id = NEW."restoredByUserId" AND u.role = 'PARENT' AND u."deletedAt" IS NULL) THEN
        RAISE EXCEPTION 'Parent cancellation must be at least 24 hours before the session';
      END IF;
    ELSE
      RAISE EXCEPTION 'Unsupported credit restoration policy';
    END IF;
    -- Never trust a caller-supplied cancellation time or extend package expiry.
    NEW."restoredAt" := checked_at;
    RETURN NEW;
  END IF;

  IF NEW."restoredAt" IS NOT NULL OR NEW."restoredByUserId" IS NOT NULL OR NEW."restorationReason" IS NOT NULL THEN
    RAISE EXCEPTION 'A new redemption cannot already be restored';
  END IF;
  NEW."redeemedAt" := checked_at;
  IF purchase.status <> 'SUCCEEDED' OR purchase."settlementVerifiedAt" IS NULL
    OR COALESCE(purchase."stripePaymentIntentId", '') = '' OR COALESCE(purchase."stripeChargeId", '') = ''
    OR COALESCE(purchase."stripeTransferId", '') = '' OR purchase."refundAmountInCents" <> 0
    OR purchase."refundPendingAmountInCents" <> 0 OR purchase."refundFailedCount" <> 0
    OR (purchase."financialReview" IS NOT NULL AND purchase."financialReview" <> 'null'::jsonb)
    OR NOT (purchase.terms @> '{"version":2}'::jsonb)
    OR (purchase.terms->>'validForDays')::integer NOT BETWEEN 1 AND 3650 THEN
    RAISE EXCEPTION 'Verified clean payment and approved credit policy required';
  END IF;
  SELECT "paidAt" INTO paid_at FROM "package_payment_receipts" WHERE "purchaseId" = purchase.id
    AND "stripePaymentIntentId" = purchase."stripePaymentIntentId" AND "stripeChargeId" = purchase."stripeChargeId"
    AND "stripeCheckoutSessionId" = purchase."stripeCheckoutSessionId";
  expires_at := paid_at + (purchase.terms->>'validForDays')::integer * interval '24 hours';
  IF paid_at IS NULL OR checked_at < paid_at OR expires_at IS NULL OR checked_at >= expires_at
    OR session."startsAt" IS NULL OR session."endsAt" IS NULL OR session."startsAt" <= checked_at
    OR session."startsAt" >= expires_at THEN
    RAISE EXCEPTION 'Verified unexpired credits and a session before expiry required';
  END IF;
  IF session."parentProfileId" <> purchase."parentProfileId" OR session."trainerProfileId" <> purchase."trainerProfileId"
    OR session."serviceOfferingId" <> NEW."serviceOfferingId" OR session.status <> 'CONFIRMED'
    OR session."packageId" IS NOT NULL OR session."packageSessionNumber" IS NOT NULL
    OR session."totalAmountInCents" <> 0 OR session."platformFeeInCents" <> 0 OR session."trainerPayoutInCents" <> 0
    OR EXISTS (SELECT 1 FROM "payments" WHERE "bookingId" = session.id) THEN
    RAISE EXCEPTION 'Credit bookings must match the purchase and cannot create a second payment';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "parent_profiles" p JOIN users u ON u.id = p."userId"
      WHERE p.id = purchase."parentProfileId" AND u.role = 'PARENT' AND u."deletedAt" IS NULL)
    OR NOT EXISTS (SELECT 1 FROM "trainer_profiles" p JOIN users u ON u.id = p."userId"
      WHERE p.id = purchase."trainerProfileId" AND p."isActive" AND p."approvalStatus" = 'APPROVED'
        AND u.role = 'TRAINER' AND u."deletedAt" IS NULL)
    OR NOT EXISTS (SELECT 1 FROM "athlete_profiles" a WHERE a.id = session."athleteProfileId" AND a."parentProfileId" = purchase."parentProfileId") THEN
    RAISE EXCEPTION 'Current parent, trainer and child ownership required';
  END IF;
  SELECT * INTO service FROM "service_offerings" WHERE id = NEW."serviceOfferingId" FOR SHARE;
  SELECT value INTO item FROM jsonb_array_elements(purchase.terms->'items') WHERE value->>'serviceOfferingId' = service.id;
  IF NOT FOUND OR NOT service."isActive" OR service."trainerProfileId" <> purchase."trainerProfileId"
    OR service."sportId" IS DISTINCT FROM item->>'sportId' OR service.type::text IS DISTINCT FROM item->>'type'
    OR service."durationMinutes" IS DISTINCT FROM (item->>'durationMinutes')::integer
    OR session."endsAt" - session."startsAt" <> service."durationMinutes" * interval '1 minute'
    OR NOT EXISTS (SELECT 1 FROM "sports" WHERE id = service."sportId" AND "isActive")
    OR NOT EXISTS (SELECT 1 FROM "trainer_sports" WHERE "trainerProfileId" = purchase."trainerProfileId" AND "sportId" = service."sportId")
    OR NOT EXISTS (SELECT 1 FROM "athlete_sports" WHERE "athleteProfileId" = session."athleteProfileId" AND "sportId" = service."sportId") THEN
    RAISE EXCEPTION 'Session eligibility must match the purchased service terms';
  END IF;
  SELECT "sessionsCount" INTO quantity FROM "package_credit_grants"
    WHERE "purchaseId" = purchase.id AND "serviceOfferingId" = NEW."serviceOfferingId";
  SELECT count(*) INTO used FROM "package_credit_redemptions"
    WHERE "purchaseId" = purchase.id AND "serviceOfferingId" = NEW."serviceOfferingId" AND "restoredAt" IS NULL;
  IF quantity IS NULL OR used >= quantity THEN RAISE EXCEPTION 'No session credits remain for this service'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER package_credit_redemptions_guard BEFORE INSERT OR UPDATE OR DELETE ON "package_credit_redemptions"
  FOR EACH ROW EXECUTE FUNCTION protect_package_credit_redemption();

CREATE FUNCTION protect_credit_booking_funding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'payments' THEN
    -- Shares the booking lock with credit attachment, including concurrent inserts.
    PERFORM id FROM "bookings" WHERE id = NEW."bookingId" FOR UPDATE;
    IF EXISTS (SELECT 1 FROM "package_credit_redemptions" WHERE "bookingId" = NEW."bookingId") THEN
      RAISE EXCEPTION 'A package-credit booking cannot also have a booking payment';
    END IF;
  ELSIF EXISTS (SELECT 1 FROM "package_credit_redemptions" WHERE "bookingId" = OLD.id) THEN
    IF ROW(NEW.id, NEW."parentProfileId", NEW."trainerProfileId", NEW."athleteProfileId", NEW."serviceOfferingId",
        NEW."packageId", NEW."packageSessionNumber", NEW."totalAmountInCents", NEW."platformFeeInCents", NEW."trainerPayoutInCents") IS DISTINCT FROM
       ROW(OLD.id, OLD."parentProfileId", OLD."trainerProfileId", OLD."athleteProfileId", OLD."serviceOfferingId",
        OLD."packageId", OLD."packageSessionNumber", OLD."totalAmountInCents", OLD."platformFeeInCents", OLD."trainerPayoutInCents") THEN
      RAISE EXCEPTION 'Credit booking identity and funding are immutable';
    END IF;
    IF NEW.status IN ('PENDING', 'RESCHEDULED') OR (OLD.status IN ('CANCELLED', 'COMPLETED', 'NO_SHOW') AND NEW.status <> OLD.status) THEN
      RAISE EXCEPTION 'Credit booking outcome cannot be reopened';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER payments_credit_funding_exclusive BEFORE INSERT OR UPDATE OF "bookingId" ON "payments"
  FOR EACH ROW EXECUTE FUNCTION protect_credit_booking_funding();
CREATE TRIGGER bookings_credit_funding_immutable BEFORE UPDATE ON "bookings"
  FOR EACH ROW EXECUTE FUNCTION protect_credit_booking_funding();
