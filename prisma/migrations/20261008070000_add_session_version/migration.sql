ALTER TABLE "users" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD CONSTRAINT "users_sessionVersion_nonnegative" CHECK ("sessionVersion" >= 0);
