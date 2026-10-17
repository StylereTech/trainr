CREATE FUNCTION require_clear_package_credit_review() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE held boolean;
BEGIN
  SELECT ("financialReview" IS NOT NULL) INTO held FROM "package_purchases"
    WHERE id = NEW."purchaseId" FOR UPDATE;
  IF held IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Verified clean package payment required: financial review is present';
  END IF;
  RETURN NEW;
END;
$$;

-- Alphabetically after existing guards, preserving their purchase/account lock order.
-- Insert-only: cancellation restoration and immutable historical records are unchanged.
CREATE TRIGGER package_credit_grants_review_present BEFORE INSERT ON "package_credit_grants"
  FOR EACH ROW EXECUTE FUNCTION require_clear_package_credit_review();
CREATE TRIGGER package_credit_redemptions_review_present BEFORE INSERT ON "package_credit_redemptions"
  FOR EACH ROW EXECUTE FUNCTION require_clear_package_credit_review();
