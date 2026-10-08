CREATE TABLE "rate_limit_buckets" (
  "keyHash" TEXT PRIMARY KEY,
  "hits" TIMESTAMPTZ(3)[] NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "rate_limit_buckets_hash_format" CHECK ("keyHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "rate_limit_buckets_bounded_hits" CHECK (cardinality("hits") <= 1000)
);
CREATE INDEX "rate_limit_buckets_expiresAt_keyHash_idx" ON "rate_limit_buckets"("expiresAt", "keyHash");
