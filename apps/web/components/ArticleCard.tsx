"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { formatScore, hostname, shortSourceName } from "@/lib/format";
import { safeHttpUrl } from "@/lib/safe-url";
import { cleanSummary } from "@/lib/story-text";
import { useLang } from "./LangContext";
import { LinkPending } from "./LinkPending";
import { ReadingBadge } from "./ReadingList";
import { SiteIcon } from "./SiteIcon";
import { TimeAgo } from "./TimeAgo";

export type ArticleCardData = {
  id: number;
  rank?: number;
  title: string;
  url: string;
  /** In-site reader path (`/a/{id}`). */
  href?: string;
  summary: string | null;
  publishedAt: string; // ISO
  score: number;
  lang: string;
  tags: string[];
  source: { slug: string; name: string };
  aiSummaryEn?: string | null;
  aiSummaryZh?: string | null;
  aiTopics?: string[];
  aiSentiment?: string | null;
  aiImportance?: number | null;
  crossPostCount?: number;
};

export const SENTIMENT_LABEL: Record<string, { en: string; zh: string }> = {
  release: { en: "Release", zh: "发布" },
  research: { en: "Research", zh: "研究" },
  opinion: { en: "Opinion", zh: "观点" },
  rumor: { en: "Rumor", zh: "传闻" },
  tutorial: { en: "Tutorial", zh: "教程" },
  other: { en: "Other", zh: "其他" },
};

function iconMask(path: string): CSSProperties {
  const value = `url(${path}) center / contain no-repeat`;
  return { WebkitMask: value, mask: value };
}

export function ArticleCard({ a, prefetch = false }: { a: ArticleCardData; prefetch?: boolean }) {
  const { lang } = useLang();
  const zh = lang === "zh";
  const rank = a.rank && a.rank > 0 ? a.rank : 0;
  const summary = cleanSummary((zh ? a.aiSummaryZh : a.aiSummaryEn) || a.aiSummaryEn || a.aiSummaryZh || a.summary, a.title);
  const sentiment = a.aiSentiment && a.aiSentiment !== "other" ? SENTIMENT_LABEL[a.aiSentiment] : null;
  const readerHref = a.href ?? `/a/${a.id}`;
  const externalUrl = safeHttpUrl(a.url);
  const host = externalUrl ? hostname(externalUrl) : "";
  const sourceName = shortSourceName(a.source.name);
  const cross = a.crossPostCount ?? 0;

  return (
    <article className={rank > 0 ? "kz-article kz-article-ranked" : "kz-article"}>
      {rank > 0 ? (
        <span className={rank <= 3 ? "kz-rank kz-rank-top" : "kz-rank"} aria-label={zh ? `第 ${rank} 名` : `Rank ${rank}`}>
          {rank}
        </span>
      ) : null}

      <div className="kz-article-body">
        {/* Per-request pages: a prefetch per visible row and tag only competes
            with the tap that matters, and LinkPending answers the tap. One row
            per list prefetches in full, which loads the article route's code. */}
        <Link href={readerHref} className="kz-article-main" prefetch={prefetch}>
          <span className="kz-article-title-row">
            {externalUrl ? <SiteIcon url={externalUrl} label={a.source.name} /> : null}
            <span className="kz-article-title">{a.title}</span>
          </span>
          {summary ? <span className="kz-article-summary">{summary}</span> : null}
          <LinkPending />
        </Link>

        <div className="kz-article-meta">
          <Link
            href={`/source/${a.source.slug}`}
            className="kz-meta-source"
            prefetch={false}
            title={sourceName !== a.source.name ? a.source.name : undefined}
          >
            {sourceName}
          </Link>
          <TimeAgo iso={a.publishedAt} lang={lang} />
          <span className="kz-article-score" title={zh ? "热度分：来源权重 × 时间衰减 × 互动信号 × AI 重要度" : "Score: source weight × time decay × signals × AI importance"}>
            {zh ? "热度" : "Score"} {formatScore(a.score)}
          </span>
          {cross > 0 ? (
            <span className="kz-meta-flag" title={zh ? "其他来源转载了同一新闻" : "Also reported by other sources"}>
              {zh ? `${cross} 源转载` : `+${cross} sources`}
            </span>
          ) : null}
          {sentiment ? (
            <span className="kz-meta-flag kz-meta-extra">
              <span className="kz-sentiment-icon" style={iconMask(`/sentiment/${a.aiSentiment}.svg`)} aria-hidden />
              {zh ? sentiment.zh : sentiment.en}
            </span>
          ) : null}
          <ReadingBadge story={{ url: a.url, title: a.title, articleId: a.id }} />
          {/* Topic tags live on the story page and in the hot list's topic
              rail; on every row they were mostly noise. */}
          {externalUrl ? (
            <a href={externalUrl} target="_blank" rel="noopener noreferrer" className="kz-host kz-meta-extra" title={zh ? "打开原文" : "Open original"}>
              {host} ↗
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}
