CREATE TABLE "package_credit_grants" (
  "purchaseId" TEXT NOT NULL,
  "serviceOfferingId" TEXT NOT NULL,
  "sessionsCount" INTEGER NOT NULL,
  "grantedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "package_credit_grants_pkey" PRIMARY KEY ("purchaseId", "serviceOfferingId"),
  CONSTRAINT "package_credit_grants_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "package_purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "package_credit_grants_quantity_valid" CHECK ("sessionsCount" BETWEEN 1 AND 1000)
);

CREATE FUNCTION protect_package_credit_grant() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE purchase "package_purchases"%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM "package_purchases" WHERE id = OLD."purchaseId") THEN
      RAISE EXCEPTION 'Credit issuance history cannot be deleted independently';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Credit issuance history is immutable';
  END IF;
  SELECT * INTO purchase FROM "package_purchases" WHERE id = NEW."purchaseId" FOR UPDATE;
  IF NOT FOUND OR purchase.status <> 'SUCCEEDED' OR purchase."settlementVerifiedAt" IS NULL
    OR COALESCE(purchase."stripePaymentIntentId", '') = '' OR COALESCE(purchase."stripeChargeId", '') = ''
    OR COALESCE(purchase."stripeTransferId", '') = '' OR purchase."refundAmountInCents" <> 0
    OR purchase."refundPendingAmountInCents" <> 0 OR purchase."refundFailedCount" <> 0
    OR (purchase."financialReview" IS NOT NULL AND purchase."financialReview" <> 'null'::jsonb) THEN
    RAISE EXCEPTION 'Verified clean package payment required for credit issuance';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(purchase.terms->'items') AS item
    WHERE item->>'serviceOfferingId' = NEW."serviceOfferingId"
      AND (item->>'sessionsCount')::integer = NEW."sessionsCount") <> 1 THEN
    RAISE EXCEPTION 'Credit quantity and service must match immutable purchase terms';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER package_credit_grants_immutable BEFORE INSERT OR UPDATE OR DELETE ON "package_credit_grants"
  FOR EACH ROW EXECUTE FUNCTION protect_package_credit_grant();
