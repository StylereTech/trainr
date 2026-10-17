-- SQL CHECK accepts UNKNOWN; coalesce nullable evidence to an explicit failure.
ALTER TABLE "account_checkout_closures"
  DROP CONSTRAINT "account_checkout_closures_state_valid",
  ADD CONSTRAINT "account_checkout_closures_state_valid" CHECK (
    "kind" IN ('BOOKING', 'PACKAGE') AND "status" IN ('PENDING', 'REVIEW', 'CLOSED')
    AND ("status" <> 'CLOSED' OR ("checkedAt" IS NOT NULL AND COALESCE(length("sessionId"), 0) > 0
      AND COALESCE("outcome", '') = 'expired_unpaid')));
