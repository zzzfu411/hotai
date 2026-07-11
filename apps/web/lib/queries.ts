import { prisma } from "./db";

/**
 * Read layer for the web app. Every page/route goes through here instead of
 * embedding Prisma queries inline — ranking/window rules live in one place.
 * The web app stays read-only against content tables (the fetcher is the
 * writer); the only web-side writes are Digest (on-demand fallback, see
 * lib/digest.ts) and AskCache (lib/ask-guard.ts + /api/ask).
 */

const WITH_SOURCE = { source: { select: { slug: true, name: true } } } as const;

export function startOfUtcDay(d: Date = new Date()): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

/** Global hot list — top by score (source weight × decay × signals × aiImportance). */
export function getTopArticles(limit = 50) {
  return prisma.article.findMany({
    orderBy: [{ score: "desc" }, { publishedAt: "desc" }],
    take: limit,
    include: WITH_SOURCE,
  });
}

/** Top-scored articles published since `since` (e.g. today's board). */
export function getArticlesSince(since: Date, limit = 20) {
  return prisma.article.findMany({
    where: { publishedAt: { gte: since } },
    orderBy: [{ score: "desc" }, { publishedAt: "desc" }],
    take: limit,
    include: WITH_SOURCE,
  });
}

export function getCategoryArticles(category: string, limit = 80) {
  return prisma.article.findMany({
    where: { category },
    orderBy: [{ score: "desc" }, { publishedAt: "desc" }],
    take: limit,
    include: WITH_SOURCE,
  });
}

export function getSourceBySlug(slug: string) {
  return prisma.source.findUnique({ where: { slug } });
}

export function getArticlesBySource(sourceId: number, limit = 80) {
  return prisma.article.findMany({
    where: { sourceId },
    orderBy: [{ publishedAt: "desc" }],
    take: limit,
    include: WITH_SOURCE,
  });
}

export function searchArticles(q: string, sort: "hot" | "recent", limit = 60) {
  return prisma.article.findMany({
    where: {
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { summary: { contains: q, mode: "insensitive" } },
        { aiSummaryEn: { contains: q, mode: "insensitive" } },
        { aiSummaryZh: { contains: q } },
        { aiTopics: { has: q.toLowerCase() } },
        { tags: { has: q.toLowerCase() } },
      ],
    },
    orderBy:
      sort === "recent"
        ? [{ publishedAt: "desc" as const }]
        : [{ score: "desc" as const }, { publishedAt: "desc" as const }],
    take: limit,
    include: WITH_SOURCE,
  });
}

export async function getHomeStats() {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const [articles24h, enabledSources, latestFetch] = await Promise.all([
    prisma.article.count({ where: { publishedAt: { gte: since } } }),
    prisma.source.count({ where: { enabled: true } }),
    prisma.source.findFirst({
      where: { lastFetch: { not: null } },
      orderBy: { lastFetch: "desc" },
      select: { lastFetch: true },
    }),
  ]);
  return { articles24h, enabledSources, lastFetch: latestFetch?.lastFetch ?? null };
}

export function getTodayDigestRow() {
  return prisma.digest.findUnique({ where: { date: startOfUtcDay() } });
}

/** Enabled source slugs — sitemap entries. */
export function getEnabledSourceSlugs() {
  return prisma.source.findMany({ where: { enabled: true }, select: { slug: true } });
}

/** Grounding corpus for /api/ask — hottest articles of the last `hours`. */
export function getAskCorpus(hours = 48, limit = 25) {
  const since = new Date(Date.now() - hours * 3600 * 1000);
  return prisma.article.findMany({
    where: { publishedAt: { gte: since } },
    orderBy: [{ score: "desc" }, { publishedAt: "desc" }],
    take: limit,
    include: WITH_SOURCE,
  });
}
