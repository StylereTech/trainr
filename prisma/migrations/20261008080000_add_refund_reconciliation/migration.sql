ALTER TABLE "payments"
  ADD COLUMN "refundPendingAmountInCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "refundFailedCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "refundsVerifiedAt" TIMESTAMP(3);

CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'REQUIRES_ACTION', 'SUCCEEDED', 'FAILED', 'CANCELED');
CREATE TABLE "payment_refunds" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "paymentId" TEXT NOT NULL REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "stripeChargeId" TEXT NOT NULL,
  "stripePaymentIntentId" TEXT NOT NULL,
  "amountInCents" INTEGER NOT NULL CHECK ("amountInCents" > 0),
  "currency" TEXT NOT NULL CHECK ("currency" = 'usd'),
  "status" "RefundStatus" NOT NULL,
  "transferReversalId" TEXT,
  "sourceTransferReversalId" TEXT,
  "failureBalanceTransactionId" TEXT,
  "failureReason" TEXT,
  "stripeCreatedAt" TIMESTAMP(3) NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "payment_refunds_paymentId_idx" ON "payment_refunds"("paymentId");
ALTER TABLE "payments" ADD CONSTRAINT "payments_refund_pending_nonnegative" CHECK ("refundPendingAmountInCents" >= 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_refund_failed_nonnegative" CHECK ("refundFailedCount" >= 0);
