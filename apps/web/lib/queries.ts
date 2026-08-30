import { cache } from "react";
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

/** Category timeline — chronological (NewsNook), not the hot-list score. */
export function getCategoryArticles(category: string, limit = 80) {
  return prisma.article.findMany({
    where: { category },
    orderBy: [{ publishedAt: "desc" }],
    take: limit,
    include: WITH_SOURCE,
  });
}

export const getSourceBySlug = cache(function getSourceBySlug(slug: string) {
  return prisma.source.findUnique({ where: { slug } });
});

export function getArticlesBySource(sourceId: number, limit = 80) {
  return prisma.article.findMany({
    where: { sourceId },
    orderBy: [{ publishedAt: "desc" }],
    take: limit,
    include: WITH_SOURCE,
  });
}

export function searchArticles(q: string, sort: "hot" | "recent", limit = 60) {
  const needle = q.trim().slice(0, 80);
  if (needle.length < 2) return Promise.resolve([]);
  return prisma.article.findMany({
    where: {
      OR: [
        { title: { contains: needle, mode: "insensitive" } },
        { summary: { contains: needle, mode: "insensitive" } },
        { aiSummaryEn: { contains: needle, mode: "insensitive" } },
        { aiSummaryZh: { contains: needle } },
        { aiTopics: { has: needle.toLowerCase() } },
        { tags: { has: needle.toLowerCase() } },
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

/** Single article for the in-site reader (`/a/[id]`). */
export const getArticleById = cache(function getArticleById(id: number) {
  return prisma.article.findUnique({
    where: { id },
    include: WITH_SOURCE,
  });
});

export function getArticlesByIds(ids: number[]) {
  if (ids.length === 0) return Promise.resolve([]);
  return prisma.article.findMany({
    where: { id: { in: ids } },
    include: WITH_SOURCE,
  });
}

const ENABLED_SOURCE_SELECT = {
  slug: true,
  name: true,
  category: true,
  homepage: true,
  url: true,
  type: true,
  lang: true,
  weight: true,
} as const;

/** Enabled sources — OPML / subscribe catalog. */
export function getEnabledSources() {
  return prisma.source.findMany({
    where: { enabled: true },
    select: ENABLED_SOURCE_SELECT,
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
}

/** Enabled source slugs — sitemap entries. */
export function getEnabledSourceSlugs() {
  return prisma.source.findMany({ where: { enabled: true }, select: { slug: true } });
}

/**
 * Related stories by `aiTopics` overlap (`hasSome` → Postgres `&&`, GIN).
 * Extra rows are fetched then ranked by overlap count so the GIN hit stays
 * cheap and the reader still sees the closest matches.
 */
export async function getRelatedArticles(topics: string[], excludeId: number, limit = 5) {
  const tags = [
    ...new Set(topics.map((t) => t.trim().toLowerCase()).filter(Boolean)),
  ];
  if (tags.length === 0 || limit <= 0) return [];

  const rows = await prisma.article.findMany({
    where: {
      id: { not: excludeId },
      aiTopics: { hasSome: tags },
    },
    orderBy: [{ score: "desc" }, { publishedAt: "desc" }],
    take: Math.min(80, Math.max(limit * 6, 20)),
    include: WITH_SOURCE,
  });

  const tagSet = new Set(tags);
  return rows
    .map((a) => ({
      a,
      overlap: a.aiTopics.reduce(
        (n, t) => n + (tagSet.has(t.trim().toLowerCase()) ? 1 : 0),
        0,
      ),
    }))
    .filter((x) => x.overlap > 0)
    .sort((x, y) => y.overlap - x.overlap || y.a.score - x.a.score)
    .slice(0, limit)
    .map((x) => x.a);
}

export type FeedArticleQuery = {
  category?: string;
  minImportance?: number;
};

/** Hot-list feed rows, optionally filtered by category / AI importance. */
export function getFeedArticles(query: FeedArticleQuery = {}, limit = 50) {
  return prisma.article.findMany({
    where: {
      ...(query.category ? { category: query.category } : {}),
      ...(query.minImportance != null
        ? { aiImportance: { gte: query.minImportance } }
        : {}),
    },
    orderBy: [{ score: "desc" }, { publishedAt: "desc" }],
    take: limit,
    include: WITH_SOURCE,
  });
}

/** Curated AI researcher/practitioner blogs — permanent editorial directory. */
export function getCuratedBlogs() {
  return prisma.curatedBlog.findMany({
    where: { enabled: true },
    orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
}

/** Enabled curated-blog slugs — sitemap entries. */
export function getCuratedBlogSlugs() {
  return prisma.curatedBlog.findMany({
    where: { enabled: true },
    select: { slug: true, updatedAt: true },
  });
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
