import { prisma } from "@hotai/db";
import { AI_ENABLED, generateDigest } from "@hotai/ai";

/**
 * Generate (or refresh) the digest row for today (UTC day).
 * Uses top-scored articles, prefers ones already AI-enriched.
 */
export async function ensureTodayDigest(opts: { force?: boolean } = {}): Promise<boolean> {
  if (!AI_ENABLED) return false;
  const today = startOfUtcDay(new Date());

  if (!opts.force) {
    const existing = await prisma.digest.findUnique({ where: { date: today } });
    if (existing) {
      const ageMs = Date.now() - existing.createdAt.getTime();
      // Refresh at most every 6 hours.
      if (ageMs < 6 * 3600 * 1000) return false;
    }
  }

  const articles = await prisma.article.findMany({
    where: { publishedAt: { gte: today } },
    orderBy: [{ score: "desc" }, { publishedAt: "desc" }],
    take: 40,
    include: { source: { select: { name: true } } },
  });
  if (articles.length < 5) {
    console.log(`[ai] digest skipped — only ${articles.length} article(s) since ${today.toISOString()}`);
    return false;
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
  if (!result) return false;

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
  console.log(`[ai] digest generated for ${today.toISOString().slice(0, 10)} — ${result.bullets.length} bullets`);
  return true;
}

function startOfUtcDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}
