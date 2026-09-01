import {
  acquireCoordinationLease,
  finishCoordinationLease,
  prisma,
  type CoordinationLeaseClaim,
} from "@hotai/db";
import { AI_DIGEST_ENABLED, AI_ENABLED, generateDigest } from "@hotai/ai";
import { config } from "./config.js";

/**
 * Generate (or refresh) the digest row for today (UTC day).
 * Uses top-scored articles, prefers ones already AI-enriched.
 */
export async function ensureTodayDigest(opts: { force?: boolean } = {}): Promise<boolean> {
  if (!AI_ENABLED || !AI_DIGEST_ENABLED) return false;
  const { start: today, end: tomorrow } = utcDayWindow(new Date());

  if (!opts.force) {
    const existing = await prisma.digest.findUnique({ where: { date: today } });
    if (existing) {
      const ageMs = Date.now() - existing.createdAt.getTime();
      // Refresh at most every 6 hours.
      if (ageMs < 6 * 3600 * 1000) return false;
    }
  }

  const articles = await prisma.article.findMany({
    where: { publishedAt: { gte: today, lt: tomorrow } },
    orderBy: [{ score: "desc" }, { publishedAt: "desc" }],
    take: 40,
    select: {
      id: true,
      title: true,
      url: true,
      score: true,
      summary: true,
      aiSummaryEn: true,
      aiTopics: true,
      source: { select: { name: true } },
    },
  });
  if (articles.length < 5) {
    console.log(`[ai] digest skipped — only ${articles.length} article(s) since ${today.toISOString()}`);
    return false;
  }

  const lease = await acquireCoordinationLease(
    `digest:${today.toISOString().slice(0, 10)}`,
    config.digestLeaseMs,
  );
  if (!lease.acquired) {
    console.log(
      `[ai] digest skipped — another worker owns generation until ${lease.leaseUntil.toISOString()}`,
    );
    return false;
  }

  try {
    // Close the check/claim race: a different worker may have completed just
    // before this lease was acquired.
    if (!opts.force) {
      const latest = await prisma.digest.findUnique({ where: { date: today } });
      if (latest && Date.now() - latest.createdAt.getTime() < 6 * 3600 * 1000) {
        await finishLeaseQuietly(lease, "success");
        return false;
      }
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
      return false;
    }

    await prisma.digest.upsert({
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
    });
    await finishLeaseQuietly(lease, "success");
    console.log(`[ai] digest generated for ${today.toISOString().slice(0, 10)} — ${result.bullets.length} bullets`);
    return true;
  } catch (error) {
    await finishLeaseQuietly(lease, "failed", error);
    throw error;
  }
}

async function finishLeaseQuietly(
  lease: Extract<CoordinationLeaseClaim, { acquired: true }>,
  status: "success" | "failed",
  error?: unknown,
): Promise<void> {
  try {
    await finishCoordinationLease(lease, status, error);
  } catch (leaseError) {
    console.warn("[ai] digest lease settlement failed:", safeError(leaseError));
  }
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 300) : "unknown database error";
}

export function utcDayWindow(d: Date): { start: Date; end: Date } {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return { start: x, end: new Date(x.getTime() + 24 * 3600 * 1000) };
}
