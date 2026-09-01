-- Add a retryable, lease-based AI enrichment state machine without removing
-- the legacy aiAnalyzedAt/aiModel fields. This is an expand-only migration so
-- the previous application version can still read the table during rollout.
ALTER TABLE "Article"
  ADD COLUMN "aiStatus" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN "aiAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "aiNextAttemptAt" TIMESTAMP(3),
  ADD COLUMN "aiLastError" TEXT,
  ADD COLUMN "aiLeaseUntil" TIMESTAMP(3),
  ADD COLUMN "aiPromptVersion" TEXT;

-- Preserve known successes. Rows previously terminalized as "skipped" are
-- made retryable immediately; untouched rows remain pending.
UPDATE "Article"
SET
  "aiStatus" = CASE
    WHEN "aiAnalyzedAt" IS NULL THEN 'pending'
    WHEN "aiModel" = 'skipped' THEN 'retry'
    ELSE 'success'
  END,
  "aiAttempts" = CASE WHEN "aiAnalyzedAt" IS NULL THEN 0 ELSE 1 END,
  "aiNextAttemptAt" = CASE WHEN "aiModel" = 'skipped' THEN CURRENT_TIMESTAMP ELSE NULL END,
  "aiLastError" = CASE WHEN "aiModel" = 'skipped' THEN 'legacy skipped result; queued for retry' ELSE NULL END,
  "aiPromptVersion" = CASE WHEN "aiAnalyzedAt" IS NOT NULL AND "aiModel" <> 'skipped' THEN 'legacy-v1' ELSE NULL END;

CREATE INDEX "Article_aiStatus_aiNextAttemptAt_score_idx"
  ON "Article"("aiStatus", "aiNextAttemptAt", "score" DESC);
CREATE INDEX "Article_aiLeaseUntil_idx" ON "Article"("aiLeaseUntil");
