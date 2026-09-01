import type { Article, Source } from "@hotai/db";
import type { ArticleCardData } from "@/components/ArticleCard";
import { safeHttpUrl } from "./safe-url";

type Row = Article & { source: Pick<Source, "slug" | "name"> };

/** Postgres `Int` range — reject anything the reader route cannot look up. */
const PG_INT_MAX = 2_147_483_647;

export type CrossPost = {
  source: string;
  url: string;
  publishedAt: string;
};

/** Path param for `/a/[id]`. Leading zeros and non-digits 404. */
export function parseArticleId(raw: string): number | null {
  if (!/^[1-9]\d{0,9}$/.test(raw)) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > PG_INT_MAX) return null;
  return n;
}

/** Validate the Article.crossPosts JSON column (never trust the blob). */
export function parseCrossPosts(value: unknown): CrossPost[] {
  if (!Array.isArray(value)) return [];
  const out: CrossPost[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.url !== "string" || typeof rec.source !== "string") continue;
    const url = safeHttpUrl(rec.url);
    const source = rec.source.trim();
    if (!url || !source) continue;
    out.push({
      source,
      url,
      publishedAt: typeof rec.publishedAt === "string" ? rec.publishedAt : "",
    });
  }
  return out;
}

export function toCard(a: Row): ArticleCardData {
  return {
    id: a.id,
    title: a.title,
    url: a.url,
    href: `/a/${a.id}`,
    summary: a.summary,
    publishedAt: a.publishedAt.toISOString(),
    score: a.score,
    lang: a.lang,
    tags: a.tags,
    source: a.source,
    aiSummaryEn: a.aiSummaryEn,
    aiSummaryZh: a.aiSummaryZh,
    aiTopics: a.aiTopics,
    aiSentiment: a.aiSentiment,
    aiImportance: a.aiImportance,
    // Reposts of this story folded in by the fetcher's cross-source dedupe.
    crossPostCount: Array.isArray(a.crossPosts) ? a.crossPosts.length : 0,
  };
}
