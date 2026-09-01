import type { Signals } from "./scoring.js";
import { normalizeSafeUrl } from "./dedupe.js";

/**
 * Pure merge helpers used by the persist stage when the same story arrives
 * again — from the same source (refreshed signals) or from another source
 * (repost). Kept free of Prisma so they're trivially unit-testable.
 */

const SIGNAL_KEYS = ["points", "comments", "stars", "downloads"] as const;

/** Validate an unknown JSON value (e.g. a Prisma Json column) into Signals. */
export function asSignals(value: unknown): Signals | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const rec = value as Record<string, unknown>;
  const out: Signals = {};
  let any = false;
  for (const key of SIGNAL_KEYS) {
    const n = Number(rec[key]);
    if (Number.isFinite(n) && n >= 0) {
      out[key] = n;
      any = true;
    }
  }
  return any ? out : undefined;
}

/**
 * Merge two signal sets, keeping the max per key. Signals are point-in-time
 * gauges (stars today, HN points) — max is the honest aggregate; summing
 * would double-count the same crowd seen through two feeds.
 */
export function mergeSignals(
  a: Signals | undefined | null,
  b: Signals | undefined | null,
): Signals | undefined {
  if (!a && !b) return undefined;
  const out: Signals = {};
  let any = false;
  for (const key of SIGNAL_KEYS) {
    const va = a?.[key];
    const vb = b?.[key];
    const v = Math.max(va ?? -1, vb ?? -1);
    if (v >= 0) {
      out[key] = v;
      any = true;
    }
  }
  return any ? out : undefined;
}

export type CrossPost = {
  source: string; // source slug
  url: string;
  publishedAt: string; // ISO
};

const CROSS_POSTS_CAP = 10;

/**
 * Append a repost record to an article's crossPosts JSON, deduped by URL,
 * capped so a wildly viral story can't grow the row unboundedly.
 * `existing` is whatever the Json column currently holds — validated, never trusted.
 */
export function appendCrossPost(existing: unknown, entry: CrossPost): CrossPost[] {
  const list: CrossPost[] = [];
  if (Array.isArray(existing)) {
    for (const item of existing) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      const safeUrl = typeof rec.url === "string" ? normalizeSafeUrl(rec.url) : null;
      if (!safeUrl || typeof rec.source !== "string") continue;
      list.push({
        source: rec.source.slice(0, 120),
        url: safeUrl,
        publishedAt: typeof rec.publishedAt === "string" ? rec.publishedAt : "",
      });
    }
  }
  const safeEntryUrl = normalizeSafeUrl(entry.url);
  if (safeEntryUrl && !list.some((c) => c.url === safeEntryUrl)) {
    list.push({
      source: entry.source.slice(0, 120),
      url: safeEntryUrl,
      publishedAt: entry.publishedAt.slice(0, 40),
    });
  }
  return list.slice(0, CROSS_POSTS_CAP);
}
