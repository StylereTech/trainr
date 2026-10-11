ALTER TABLE "package_purchases"
  ADD COLUMN "stripeCheckoutSessionId" TEXT,
  ADD COLUMN "stripePaymentIntentId" TEXT,
  ADD COLUMN "stripeChargeId" TEXT,
  ADD COLUMN "stripeTransferId" TEXT,
  ADD COLUMN "settlementVerifiedAt" TIMESTAMPTZ(3),
  ADD COLUMN "financialReview" JSONB;
CREATE UNIQUE INDEX "package_purchases_stripeCheckoutSessionId_key" ON "package_purchases"("stripeCheckoutSessionId");
CREATE UNIQUE INDEX "package_purchases_stripePaymentIntentId_key" ON "package_purchases"("stripePaymentIntentId");
CREATE UNIQUE INDEX "package_purchases_stripeChargeId_key" ON "package_purchases"("stripeChargeId");
CREATE UNIQUE INDEX "package_purchases_stripeTransferId_key" ON "package_purchases"("stripeTransferId");

CREATE TABLE "package_checkout_attempts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "purchaseId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "parameters" JSONB NOT NULL,
  "stripeCheckoutSessionId" TEXT,
  "retiredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "package_checkout_attempts_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "package_purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "package_checkout_attempts_sequence_positive" CHECK ("sequence" > 0)
);
CREATE UNIQUE INDEX "package_checkout_attempts_purchaseId_sequence_key" ON "package_checkout_attempts"("purchaseId", "sequence");
CREATE UNIQUE INDEX "package_checkout_attempts_stripeCheckoutSessionId_key" ON "package_checkout_attempts"("stripeCheckoutSessionId");
CREATE UNIQUE INDEX "package_checkout_attempts_one_active_purchase" ON "package_checkout_attempts"("purchaseId") WHERE "retiredAt" IS NULL;

CREATE FUNCTION protect_package_checkout_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."id", NEW."purchaseId", NEW."sequence", NEW."parameters", NEW."createdAt") IS DISTINCT FROM
     ROW(OLD."id", OLD."purchaseId", OLD."sequence", OLD."parameters", OLD."createdAt") OR
     (OLD."stripeCheckoutSessionId" IS NOT NULL AND NEW."stripeCheckoutSessionId" IS DISTINCT FROM OLD."stripeCheckoutSessionId") OR
     (OLD."retiredAt" IS NOT NULL AND NEW."retiredAt" IS DISTINCT FROM OLD."retiredAt") THEN
    RAISE EXCEPTION 'Package checkout attempt identity and parameters are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER package_checkout_attempts_immutable BEFORE UPDATE ON "package_checkout_attempts"
  FOR EACH ROW EXECUTE FUNCTION protect_package_checkout_attempt();
