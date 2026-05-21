import type { Article, Source } from "@hotai/db";
import type { ArticleCardData } from "@/components/ArticleCard";

type Row = Article & { source: Pick<Source, "slug" | "name"> };

export function toCard(a: Row): ArticleCardData {
  return {
    id: a.id,
    title: a.title,
    url: a.url,
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
  };
}
