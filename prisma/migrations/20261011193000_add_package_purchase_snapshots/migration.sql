CREATE TABLE "package_purchases" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "parentProfileId" TEXT NOT NULL,
  "trainerProfileId" TEXT NOT NULL,
  "packageId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "catalogRevision" TIMESTAMPTZ(3) NOT NULL,
  "terms" JSONB NOT NULL,
  "amountInCents" INTEGER NOT NULL,
  "platformFeeInCents" INTEGER NOT NULL,
  "trainerPayoutInCents" INTEGER NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "package_purchases_parentProfileId_fkey" FOREIGN KEY ("parentProfileId") REFERENCES "parent_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "package_purchases_trainerProfileId_fkey" FOREIGN KEY ("trainerProfileId") REFERENCES "trainer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "package_purchases_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "package_purchases_amounts_valid" CHECK (
    "amountInCents" BETWEEN 50 AND 99999999 AND "platformFeeInCents" >= 0 AND "trainerPayoutInCents" >= 0
    AND "platformFeeInCents"::bigint + "trainerPayoutInCents"::bigint = "amountInCents"
  ),
  CONSTRAINT "package_purchases_hash_valid" CHECK ("payloadHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "package_purchases_terms_version" CHECK (jsonb_typeof("terms") = 'object' AND "terms" @> '{"version":1}'::jsonb)
);
CREATE UNIQUE INDEX "package_purchases_parentProfileId_requestId_key" ON "package_purchases"("parentProfileId", "requestId");
CREATE INDEX "package_purchases_trainerProfileId_createdAt_idx" ON "package_purchases"("trainerProfileId", "createdAt");
CREATE INDEX "package_purchases_packageId_idx" ON "package_purchases"("packageId");

CREATE FUNCTION protect_package_purchase_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."id", NEW."parentProfileId", NEW."trainerProfileId", NEW."packageId", NEW."requestId", NEW."payloadHash",
         NEW."catalogRevision", NEW."terms", NEW."amountInCents", NEW."platformFeeInCents", NEW."trainerPayoutInCents", NEW."createdAt") IS DISTINCT FROM
     ROW(OLD."id", OLD."parentProfileId", OLD."trainerProfileId", OLD."packageId", OLD."requestId", OLD."payloadHash",
         OLD."catalogRevision", OLD."terms", OLD."amountInCents", OLD."platformFeeInCents", OLD."trainerPayoutInCents", OLD."createdAt") THEN
    RAISE EXCEPTION 'Package purchase terms and ownership are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER package_purchases_snapshot_immutable BEFORE UPDATE ON "package_purchases"
  FOR EACH ROW EXECUTE FUNCTION protect_package_purchase_snapshot();
