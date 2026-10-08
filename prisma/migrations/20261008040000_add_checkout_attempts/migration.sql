CREATE TABLE "checkout_attempts" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "parameters" JSONB NOT NULL,
  "stripeCheckoutSessionId" TEXT,
  "retiredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "checkout_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "checkout_attempts_sequence_positive" CHECK ("sequence" > 0),
  CONSTRAINT "checkout_attempts_paymentId_fkey" FOREIGN KEY ("paymentId")
    REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "checkout_attempts_stripeCheckoutSessionId_key"
  ON "checkout_attempts"("stripeCheckoutSessionId");
CREATE UNIQUE INDEX "checkout_attempts_paymentId_sequence_key"
  ON "checkout_attempts"("paymentId", "sequence");
CREATE UNIQUE INDEX "checkout_attempts_one_active_payment"
  ON "checkout_attempts"("paymentId") WHERE "retiredAt" IS NULL;
