-- A completed fetch cycle can be usable but incomplete (for example, a
-- source returned only out-of-window items). Keep that state distinct from a
-- hard failure so health surfaces can explain the difference.
ALTER TABLE "CoordinationLease"
  DROP CONSTRAINT IF EXISTS "CoordinationLease_status_check";

ALTER TABLE "CoordinationLease"
  ADD CONSTRAINT "CoordinationLease_status_check"
  CHECK ("lastStatus" IN ('running', 'success', 'degraded', 'failed'));
