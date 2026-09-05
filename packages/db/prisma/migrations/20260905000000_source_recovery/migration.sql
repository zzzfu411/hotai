-- Additive only. Existing disabled sources stay disabled; operator intent is unknown.
ALTER TABLE "Source" ADD COLUMN "autoPausedUntil" TIMESTAMP(3);
