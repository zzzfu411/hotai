import type { PersistStats } from "./store.js";

export type SourceContentAssessment = {
  status: "ok" | "degraded" | "failed";
  reason?: string;
};

export function assessEnabledSources(count: number): SourceContentAssessment {
  return count > 0
    ? { status: "ok" }
    : { status: "degraded", reason: "no enabled sources" };
}

/**
 * Classify a successful adapter response after validation/persistence. Keeping
 * this decision pure makes the source-health contract easy to test and keeps
 * low-frequency (all-old) feeds from being auto-disabled accidentally.
 */
export function assessSourceContent(
  rawItemCount: number,
  stats: Pick<
    PersistStats,
    "accepted" | "discardedInvalid" | "discardedOutsideWindow" | "failed"
  >,
): SourceContentAssessment {
  if (rawItemCount <= 0) {
    return { status: "failed", reason: "source returned 0 items" };
  }
  if (stats.failed > 0) {
    return { status: "failed", reason: `persist failed for ${stats.failed} item(s)` };
  }
  if (stats.accepted === 0 && stats.discardedInvalid > 0) {
    return {
      status: "failed",
      reason: `no usable items (${stats.discardedInvalid} invalid, ${stats.discardedOutsideWindow} outside retention window)`,
    };
  }
  if (stats.accepted === 0) {
    return {
      status: "degraded",
      reason: `${stats.discardedOutsideWindow} item(s) outside the 14-day retention window`,
    };
  }
  if (stats.discardedInvalid > 0) {
    return { status: "degraded", reason: `${stats.discardedInvalid} invalid item(s) discarded` };
  }
  return { status: "ok" };
}
