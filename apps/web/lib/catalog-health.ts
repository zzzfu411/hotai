import { CATALOG_SOURCES } from "./catalog";
import { peekFeedCache, readableFeedSnapshot, FEED_CACHE_STALE_MS } from "./feed-cache";

/** Observations are process-local; a cold process is unknown, never healthy by inference. */
export function catalogHealth(now = Date.now()) {
  const counts = { fresh: 0, stale: 0, failed: 0, unknown: 0 };
  let lastSuccessAt: string | null = null;
  for (const source of CATALOG_SOURCES.filter(s => s.url.startsWith("https://"))) {
    const snapshot = readableFeedSnapshot(source.url, now);
    const entry = peekFeedCache(source.url);
    if (snapshot) {
      counts[snapshot.stale ? "stale" : "fresh"]++;
      if (!lastSuccessAt || snapshot.fetchedAt > lastSuccessAt) lastSuccessAt = snapshot.fetchedAt;
    } else if (entry?.fail && now - entry.at < FEED_CACHE_STALE_MS) counts.failed++;
    else counts.unknown++;
  }
  const status = counts.fresh > 0 ? (counts.stale || counts.failed ? "degraded" : "ok")
    : counts.stale ? "degraded" : counts.failed ? "unavailable" : "unknown";
  return { scope: "process" as const, status, ...counts, lastSuccessAt };
}
