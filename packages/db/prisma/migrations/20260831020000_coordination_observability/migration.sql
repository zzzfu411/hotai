-- Durable singleton-job leases plus shared public-endpoint rate-limit state.
-- Both tables are additive so the previous application version remains able
-- to run during a staged deployment.
CREATE TABLE "CoordinationLease" (
  "name" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "leaseUntil" TIMESTAMP(3) NOT NULL,
  "heartbeatAt" TIMESTAMP(3) NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "lastFinishedAt" TIMESTAMP(3),
  "lastStatus" TEXT NOT NULL DEFAULT 'running',
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CoordinationLease_pkey" PRIMARY KEY ("name"),
  CONSTRAINT "CoordinationLease_attempts_check" CHECK ("attempts" >= 1),
  CONSTRAINT "CoordinationLease_status_check" CHECK ("lastStatus" IN ('running', 'success', 'failed'))
);

CREATE INDEX "CoordinationLease_leaseUntil_idx"
  ON "CoordinationLease"("leaseUntil");
CREATE INDEX "CoordinationLease_lastStatus_leaseUntil_idx"
  ON "CoordinationLease"("lastStatus", "leaseUntil");

CREATE TABLE "RateLimitBucket" (
  "name" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 1,
  "resetAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("name", "keyHash"),
  CONSTRAINT "RateLimitBucket_count_check" CHECK ("count" >= 1)
);

CREATE INDEX "RateLimitBucket_resetAt_idx"
  ON "RateLimitBucket"("resetAt");
CREATE INDEX "RateLimitBucket_name_resetAt_idx"
  ON "RateLimitBucket"("name", "resetAt");
