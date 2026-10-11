-- Legacy rows retain unknown instants. Never infer historical zones from today's profile.
ALTER TABLE "bookings" ADD COLUMN "timeZone" TEXT,
  ADD COLUMN "startsAt" TIMESTAMPTZ(3), ADD COLUMN "endsAt" TIMESTAMPTZ(3);
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_time_snapshot_complete" CHECK (
  ("timeZone" IS NULL AND "startsAt" IS NULL AND "endsAt" IS NULL) OR
  ("timeZone" IS NOT NULL AND length("timeZone") > 0 AND "startsAt" IS NOT NULL AND "endsAt" IS NOT NULL AND "endsAt" > "startsAt")
);
CREATE INDEX "bookings_trainerProfileId_startsAt_endsAt_idx" ON "bookings"("trainerProfileId", "startsAt", "endsAt");
CREATE INDEX "bookings_athleteProfileId_startsAt_endsAt_idx" ON "bookings"("athleteProfileId", "startsAt", "endsAt");

CREATE FUNCTION protect_booking_time_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."startsAt" IS NOT NULL AND
     ROW(NEW."date", NEW."startTime", NEW."endTime", NEW."timeZone", NEW."startsAt", NEW."endsAt") IS DISTINCT FROM
     ROW(OLD."date", OLD."startTime", OLD."endTime", OLD."timeZone", OLD."startsAt", OLD."endsAt") THEN
    RAISE EXCEPTION 'Booking time snapshot is immutable; create a replacement reservation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER bookings_time_snapshot_immutable BEFORE UPDATE ON "bookings"
  FOR EACH ROW EXECUTE FUNCTION protect_booking_time_snapshot();
