-- Keep the exact corpus references used by a cached answer. Reconstructing
-- them from today's ranking can make an old [n] citation point at a different
-- article after the hot list changes.
ALTER TABLE "AskCache"
  ADD COLUMN "sources" JSONB;
