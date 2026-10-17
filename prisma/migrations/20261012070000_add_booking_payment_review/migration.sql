-- Existing success labels are not evidence of a verified destination receipt.
ALTER TABLE "payments"
  ADD COLUMN "settlementVerifiedAt" TIMESTAMPTZ(3),
  ADD COLUMN "financialReview" JSONB;
