CREATE TABLE "athlete_create_requests" (
  "parentProfileId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "athleteProfileId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "athlete_create_requests_pkey" PRIMARY KEY ("parentProfileId", "requestId"),
  CONSTRAINT "athlete_create_requests_parentProfileId_fkey" FOREIGN KEY ("parentProfileId") REFERENCES "parent_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "athlete_create_requests_athleteProfileId_fkey" FOREIGN KEY ("athleteProfileId") REFERENCES "athlete_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "athlete_create_requests_athleteProfileId_idx" ON "athlete_create_requests"("athleteProfileId");
