ALTER TABLE "package_purchases"
  ADD COLUMN "refundAmountInCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "refundPendingAmountInCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "refundFailedCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "refundsVerifiedAt" TIMESTAMPTZ(3),
  ADD CONSTRAINT "package_purchases_refund_totals_valid" CHECK (
    "refundAmountInCents" >= 0 AND "refundPendingAmountInCents" >= 0 AND "refundFailedCount" >= 0
    AND "refundAmountInCents"::BIGINT + "refundPendingAmountInCents"::BIGINT <= "amountInCents"
  );

CREATE TABLE "package_refunds" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "purchaseId" TEXT NOT NULL,
  "stripeChargeId" TEXT NOT NULL,
  "stripePaymentIntentId" TEXT NOT NULL,
  "amountInCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "status" "RefundStatus" NOT NULL,
  "transferReversalId" TEXT,
  "sourceTransferReversalId" TEXT,
  "failureBalanceTransactionId" TEXT,
  "failureReason" TEXT,
  "stripeCreatedAt" TIMESTAMPTZ(3) NOT NULL,
  "observedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "package_refunds_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "package_purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "package_refunds_amount_currency_valid" CHECK ("amountInCents" > 0 AND "currency" = 'usd')
);
CREATE INDEX "package_refunds_purchaseId_idx" ON "package_refunds"("purchaseId");

CREATE FUNCTION protect_package_refund_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."id", NEW."purchaseId", NEW."stripeChargeId", NEW."stripePaymentIntentId", NEW."amountInCents", NEW."currency", NEW."stripeCreatedAt") IS DISTINCT FROM
     ROW(OLD."id", OLD."purchaseId", OLD."stripeChargeId", OLD."stripePaymentIntentId", OLD."amountInCents", OLD."currency", OLD."stripeCreatedAt") THEN
    RAISE EXCEPTION 'Package refund financial identity is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER package_refunds_identity_immutable BEFORE UPDATE ON "package_refunds"
  FOR EACH ROW EXECUTE FUNCTION protect_package_refund_identity();
