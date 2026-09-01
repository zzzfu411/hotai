import { config } from "./config.js";

const MAX_FUTURE_SKEW_MS = 24 * 60 * 60 * 1000;

/** Persistence-side retention guard; purge alone cannot stop old-feed replay. */
export function isRetainablePublishedAt(
  value: Date,
  nowMs = Date.now(),
  retentionDays = config.retentionDays,
): boolean {
  const time = value.getTime();
  if (!Number.isFinite(time)) return false;
  const oldest = nowMs - retentionDays * 24 * 60 * 60 * 1000;
  return time >= oldest && time <= nowMs + MAX_FUTURE_SKEW_MS;
}
