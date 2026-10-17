-- Existing trainers must explicitly choose a zone; do not infer or backfill one.
ALTER TABLE "trainer_profiles" ADD COLUMN "timeZone" TEXT;
