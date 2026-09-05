import {
  acquireCoordinationLease,
  startCoordinationHeartbeat,
  withCoordinationLease,
  finishCoordinationLease,
  type CoordinationLeaseClaim,
} from "@hotai/db";
import { AI_DIGEST_ENABLED, AI_ENABLED, generateDigest, type DigestBullet } from "@hotai/ai";
import { getArticlesSince, getTodayDigestRow, startOfUtcDay } from "./queries";
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

/**
 * Today's digest: DB hit first (the fetcher refreshes it every ≤6h); when the
 * row doesn't exist yet — e.g. the first visitor of a fresh UTC day before the
 * fetcher's next cycle — generate one on the fly and persist it. This is the
 * one deliberate web-side write to content data.
 */
const g = globalThis as typeof globalThis & { __hotai_digest_gen?: Promise<LoadedDigest | null> };

function bounded(env: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(env);
  const value = Number.isFinite(n) && env !== undefined && env !== "" ? n : fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

const DIGEST_LEASE_MS =
  bounded(process.env.DIGEST_GENERATION_LEASE_SECONDS, 300, 120, 3_600) * 1000;
const DIGEST_WAIT_MS = bounded(process.env.DIGEST_GENERATION_WAIT_MS, 2_500, 0, 10_000);

export async function loadDigest(): Promise<LoadedDigest | null> {
  const today = startOfUtcDay();
  const existing = await getTodayDigestRow();
  if (existing) {
    return {
      headline: existing.headline,
      overview: existing.overview,
      bullets: sanitizeBullets(existing.bullets),
      themes: existing.themes,
      model: existing.model,
      createdAt: existing.createdAt,
    };
  }

  if (!AI_ENABLED || !AI_DIGEST_ENABLED) return null;
  if (g.__hotai_digest_gen) return g.__hotai_digest_gen;

  const job = (async (): Promise<LoadedDigest | null> => {
    const articles = await getArticlesSince(today, 40);
    if (articles.length < 5) return null;

    const lease = await acquireCoordinationLease(
      `digest:${today.toISOString().slice(0, 10)}`,
      DIGEST_LEASE_MS,
    );
    if (!lease.acquired) return waitForDigest(DIGEST_WAIT_MS);

    const heartbeat = startCoordinationHeartbeat(lease, DIGEST_LEASE_MS);
    try {
      // Close the initial read/claim race before spending provider tokens.
      const raced = await getTodayDigestRow();
      if (raced) {
        await finishLeaseQuietly(lease, "success");
        return loadedFromRow(raced);
      }

      const result = await generateDigest(
        articles.map((a) => ({
          id: a.id,
          title: a.title,
          summaryEn: a.aiSummaryEn ?? a.summary ?? null,
          url: a.url,
          sourceName: a.source.name,
          score: a.score,
          topics: a.aiTopics,
        })),
      );
      if (!result) {
        await finishLeaseQuietly(lease, "failed", "digest generator returned no valid result");
        return null;
      }

      const saved = await withCoordinationLease(lease, tx => tx.digest.upsert({
        where: { date: today },
        create: {
          date: today,
          headline: result.headline,
          overview: result.overview,
          bullets: result.bullets as unknown as object,
          themes: result.themes,
          model: result.model,
        },
        update: {
          headline: result.headline,
          overview: result.overview,
          bullets: result.bullets as unknown as object,
          themes: result.themes,
          model: result.model,
          createdAt: new Date(),
        },
      }));
      await finishLeaseQuietly(lease, "success");
      return {
        headline: result.headline,
        overview: result.overview,
        bullets: result.bullets,
        themes: result.themes,
        model: result.model,
        createdAt: saved.createdAt,
      };
    } catch (error) {
      await finishLeaseQuietly(lease, "failed", error);
      throw error;
    } finally { await heartbeat.stop(); }
  })();

  g.__hotai_digest_gen = job;
  try {
    return await job;
  } finally {
    if (g.__hotai_digest_gen === job) g.__hotai_digest_gen = undefined;
  }
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

async function finishLeaseQuietly(
  lease: Extract<CoordinationLeaseClaim, { acquired: true }>,
  status: "success" | "failed",
  error?: unknown,
): Promise<void> {
  try {
    await finishCoordinationLease(lease, status, error);
  } catch (leaseError) {
    console.warn(
      "[digest] lease settlement failed:",
      leaseError instanceof Error ? leaseError.message.slice(0, 300) : "unknown database error",
    );
  }
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
