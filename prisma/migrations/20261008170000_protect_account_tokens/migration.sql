ALTER TABLE "users" ADD COLUMN "verificationTokenSeed" TEXT;
ALTER TABLE "users" ADD COLUMN "resetPasswordTokenSeed" TEXT;

-- Legacy bearer links cannot remain valid after the coordinated application rollout.
UPDATE "users" SET "verificationToken" = NULL, "verificationExpiry" = NULL,
  "resetPasswordToken" = NULL, "resetPasswordExpiry" = NULL
WHERE "verificationToken" IS NOT NULL OR "resetPasswordToken" IS NOT NULL;

CREATE INDEX "users_verificationToken_idx" ON "users"("verificationToken");
CREATE INDEX "users_resetPasswordToken_idx" ON "users"("resetPasswordToken");
