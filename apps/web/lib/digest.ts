import { runDigestGeneration, startOfUtcDay } from "@hotai/db";
import { AI_DIGEST_ENABLED, AI_ENABLED, generateDigest, type DigestBullet } from "@hotai/ai";
import { getLatestDigestRowBefore, getTodayDigestRow } from "./queries";
import { envInt } from "./env";
import { safeHttpUrl } from "./safe-url";
export { linkDigestBullets } from "./digest-links";

export type LoadedDigest = {
  headline: string;
  overview: string;
  bullets: DigestBullet[];
  themes: string[];
  model?: string | null;
  createdAt: Date;
};

const g = globalThis as typeof globalThis & { __hotai_digest_gen?: Promise<LoadedDigest | null> };

const DIGEST_LEASE_MS =
  envInt(process.env.DIGEST_GENERATION_LEASE_SECONDS, 300, 120, 3_600) * 1000;
const DIGEST_WAIT_MS = envInt(process.env.DIGEST_GENERATION_WAIT_MS, 2_500, 0, 10_000);

/**
 * Today's digest: DB hit first (the fetcher refreshes it every ≤6h); when the
 * row doesn't exist yet — e.g. the first visitor of a fresh UTC day before the
 * fetcher's next cycle — generate one on the fly and persist it. This is the
 * one deliberate web-side write to content data.
 */
export async function loadDigest(): Promise<LoadedDigest | null> {
  const existing = await getTodayDigestRow();
  if (existing) return loadedFromRow(existing);

  if (!AI_ENABLED || !AI_DIGEST_ENABLED) return null;
  if (g.__hotai_digest_gen) return g.__hotai_digest_gen;

  const job = (async (): Promise<LoadedDigest | null> => {
    const run = await runDigestGeneration({
      day: startOfUtcDay(),
      leaseMs: DIGEST_LEASE_MS,
      // Any row for today will do; the fetcher handles refreshes.
      keep: () => true,
      generate: generateDigest,
    });
    if (run.status === "busy") return waitForDigest(DIGEST_WAIT_MS);
    return run.status === "saved" || run.status === "current" ? loadedFromRow(run.row) : null;
  })();

  g.__hotai_digest_gen = job;
  try {
    return await job;
  } finally {
    if (g.__hotai_digest_gen === job) g.__hotai_digest_gen = undefined;
  }
}

/**
 * The latest digest from an earlier UTC day. Today's brief needs five stored
 * stories, so for the first hours of each day this is what readers get.
 */
export async function loadPreviousDigest(): Promise<(LoadedDigest & { date: Date }) | null> {
  const row = await getLatestDigestRowBefore(startOfUtcDay());
  return row ? { ...loadedFromRow(row), date: row.date } : null;
}

async function waitForDigest(waitMs: number): Promise<LoadedDigest | null> {
  const deadline = Date.now() + waitMs;
  do {
    const row = await getTodayDigestRow();
    if (row) return loadedFromRow(row);
    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(250, deadline - Date.now())));
  } while (Date.now() < deadline);
  return null;
}

function loadedFromRow(row: NonNullable<Awaited<ReturnType<typeof getTodayDigestRow>>>): LoadedDigest {
  return {
    headline: row.headline,
    overview: row.overview,
    bullets: sanitizeBullets(row.bullets),
    themes: row.themes,
    model: row.model,
    createdAt: row.createdAt,
  };
}


function sanitizeBullets(value: unknown): DigestBullet[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      title: typeof item.title === "string" ? item.title.trim().slice(0, 160) : "",
      takeaway: typeof item.takeaway === "string" ? item.takeaway.trim().slice(0, 360) : "",
      articleIds: Array.isArray(item.articleIds)
        ? [...new Set(
            item.articleIds
              .filter((id): id is number => typeof id === "number" && Number.isInteger(id) && id > 0)
              .slice(0, 4),
          )]
        : undefined,
      urls: Array.isArray(item.urls)
        ? item.urls
            .filter((url): url is string => typeof url === "string")
            .map((url) => safeHttpUrl(url))
            .filter((url): url is string => Boolean(url))
            .slice(0, 2)
        : [],
    }))
    .filter((item) => item.title.length > 0 && item.takeaway.length > 0)
    .slice(0, 4);
}
