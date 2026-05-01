-- Trainr phone onboarding agent lead capture
CREATE TABLE IF NOT EXISTS "trainer_phone_leads" (
  "id" TEXT NOT NULL,
  "twilioCallSid" TEXT,
  "callerPhone" TEXT,
  "status" TEXT NOT NULL DEFAULT 'in_progress',
  "trainerProfileId" TEXT,
  "recordingConsent" BOOLEAN NOT NULL DEFAULT true,
  "aiDisclosureGiven" BOOLEAN NOT NULL DEFAULT true,
  "smsConsent" BOOLEAN NOT NULL DEFAULT true,
  "trainerIdentity" JSONB NOT NULL DEFAULT '{}',
  "trainingProfile" JSONB NOT NULL DEFAULT '{}',
  "businessOperations" JSONB NOT NULL DEFAULT '{}',
  "salesStatus" JSONB NOT NULL DEFAULT '{}',
  "callMetadata" JSONB NOT NULL DEFAULT '{}',
  "transcript" JSONB,
  "summary" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "trainer_phone_leads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "trainer_phone_leads_twilioCallSid_key" ON "trainer_phone_leads"("twilioCallSid");
CREATE INDEX IF NOT EXISTS "trainer_phone_leads_callerPhone_idx" ON "trainer_phone_leads"("callerPhone");
CREATE INDEX IF NOT EXISTS "trainer_phone_leads_status_idx" ON "trainer_phone_leads"("status");

ALTER TABLE "trainer_phone_leads"
  ADD CONSTRAINT "trainer_phone_leads_trainerProfileId_fkey"
  FOREIGN KEY ("trainerProfileId") REFERENCES "trainer_profiles"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
