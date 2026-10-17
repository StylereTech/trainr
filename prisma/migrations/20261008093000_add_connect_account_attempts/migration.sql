CREATE TABLE "connect_account_attempts" (
    "id" TEXT NOT NULL,
    "trainerProfileId" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stripeAccountId" TEXT,
    CONSTRAINT "connect_account_attempts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "connect_account_attempts_trainerProfileId_key" ON "connect_account_attempts"("trainerProfileId");
CREATE UNIQUE INDEX "connect_account_attempts_stripeAccountId_key" ON "connect_account_attempts"("stripeAccountId");
ALTER TABLE "connect_account_attempts" ADD CONSTRAINT "connect_account_attempts_trainerProfileId_fkey" FOREIGN KEY ("trainerProfileId") REFERENCES "trainer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
