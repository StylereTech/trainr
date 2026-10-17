CREATE TABLE "package_payment_receipts" (
  "purchaseId" TEXT NOT NULL PRIMARY KEY,
  "stripeEventId" TEXT NOT NULL UNIQUE,
  "stripePaymentIntentId" TEXT NOT NULL UNIQUE,
  "stripeChargeId" TEXT NOT NULL UNIQUE,
  "stripeCheckoutSessionId" TEXT NOT NULL UNIQUE,
  "livemode" BOOLEAN NOT NULL,
  "paidAt" TIMESTAMPTZ(3) NOT NULL,
  "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "package_payment_receipts_purchaseId_fkey" FOREIGN KEY ("purchaseId")
    REFERENCES "package_purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "package_payment_receipts_time_valid" CHECK (
    "paidAt" >= '2000-01-01'::timestamptz AND "paidAt" <= "recordedAt" + interval '5 minutes'),
  CONSTRAINT "package_payment_receipts_ids_valid" CHECK (
    "stripeEventId" ~ '^evt_[A-Za-z0-9_]{1,250}$' AND
    "stripePaymentIntentId" ~ '^pi_[A-Za-z0-9_]{1,250}$' AND
    "stripeChargeId" ~ '^ch_[A-Za-z0-9_]{1,250}$' AND
    "stripeCheckoutSessionId" ~ '^cs_[A-Za-z0-9_]{1,250}$')
);

CREATE FUNCTION protect_package_payment_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE purchase "package_purchases"%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM "package_purchases" WHERE id = OLD."purchaseId") THEN
      RAISE EXCEPTION 'Package payment evidence cannot be deleted independently';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Package payment evidence is immutable';
  END IF;
  SELECT * INTO purchase FROM "package_purchases" WHERE id = NEW."purchaseId" FOR UPDATE;
  IF NOT FOUND OR purchase."settlementVerifiedAt" IS NULL
    OR purchase."stripePaymentIntentId" IS DISTINCT FROM NEW."stripePaymentIntentId"
    OR purchase."stripeChargeId" IS DISTINCT FROM NEW."stripeChargeId"
    OR purchase."stripeCheckoutSessionId" IS DISTINCT FROM NEW."stripeCheckoutSessionId"
    OR COALESCE(purchase."stripeTransferId", '') = ''
    OR NEW."paidAt" < date_trunc('second', purchase."createdAt" AT TIME ZONE 'UTC') THEN
    RAISE EXCEPTION 'Payment success evidence must match the verified package settlement';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER package_payment_receipts_immutable BEFORE INSERT OR UPDATE OR DELETE
  ON "package_payment_receipts" FOR EACH ROW EXECUTE FUNCTION protect_package_payment_receipt();
