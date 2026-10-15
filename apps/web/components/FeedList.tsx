"use client";

import { useState, type ReactNode } from "react";
import { ArticleCard, SENTIMENT_LABEL, type ArticleCardData } from "./ArticleCard";
import { useLang } from "./LangContext";

/** Story kinds the AI pass assigns, in the order the filter shows them. */
const KINDS = ["release", "research", "opinion", "tutorial", "rumor"] as const;

export function FeedList({
  articles,
  ranked = false,
  titleZh,
  titleEn,
  subtitleZh,
  subtitleEn,
  titleAs = "h1",
  action,
  emptyTitleZh,
  emptyTitleEn,
  emptyCopyZh,
  emptyCopyEn,
  kindFilter = false,
}: {
  articles: ArticleCardData[];
  ranked?: boolean;
  titleZh?: string;
  titleEn?: string;
  subtitleZh?: string;
  subtitleEn?: string;
  titleAs?: "h1" | "h2";
  action?: ReactNode;
  emptyTitleZh?: string;
  emptyTitleEn?: string;
  emptyCopyZh?: string;
  emptyCopyEn?: string;
  /** Offer chips that narrow the list to one story kind (release, research…). */
  kindFilter?: boolean;
}) {
  const { lang } = useLang();
  const zh = lang === "zh";
  const [kind, setKind] = useState<string | null>(null);
  // Ranks belong to the full list, so a filtered row keeps its place number.
  const numbered = ranked ? articles.map((a, i) => ({ ...a, rank: i + 1 })) : articles;
  const counts = new Map<string, number>();
  for (const a of articles) {
    if (a.aiSentiment) counts.set(a.aiSentiment, (counts.get(a.aiSentiment) ?? 0) + 1);
  }
  const kinds = KINDS.filter((k) => counts.get(k));
  const showFilter = kindFilter && kinds.length >= 2;
  const activeKind = showFilter && kind && counts.get(kind) ? kind : null;
  const visible = activeKind ? numbered.filter((a) => a.aiSentiment === activeKind) : numbered;
  const title = zh ? titleZh : titleEn;
  const subtitle = zh ? subtitleZh ?? subtitleEn : subtitleEn ?? subtitleZh;
  const TitleTag = titleAs;
  const showHead = Boolean(title || subtitle || action);
  const emptyTitle = zh ? emptyTitleZh ?? "暂无文章" : emptyTitleEn ?? "No articles yet";
  const emptyCopy = zh
    ? emptyCopyZh ?? "抓取器可能还在预热，稍后再刷新。"
    : emptyCopyEn ?? "The fetcher may still be warming up. Refresh in a minute.";

  return (
    <section className="kz-feed">
      {showHead ? (
        <header className="kz-feed-head">
          <div>
            {title ? <TitleTag className="kz-feed-title">{title}</TitleTag> : null}
            {subtitle ? <p className="kz-feed-sub">{subtitle}</p> : null}
          </div>
          <div className="kz-feed-head-end">
            {action}
            <p className="kz-feed-count">
              {visible.length}
              {zh ? " 篇" : visible.length === 1 ? " story" : " stories"}
            </p>
          </div>
        </header>
      ) : null}

      {showFilter ? (
        <div className="kz-filter-tags kz-feed-filter" role="group" aria-label={zh ? "按类型筛选" : "Filter by kind"}>
          <button type="button" className="kz-chip" aria-pressed={activeKind === null} onClick={() => setKind(null)}>
            {zh ? "全部" : "All"} <span>{articles.length}</span>
          </button>
          {kinds.map((k) => (
            <button
              key={k}
              type="button"
              className="kz-chip"
              aria-pressed={activeKind === k}
              onClick={() => setKind(activeKind === k ? null : k)}
            >
              {zh ? SENTIMENT_LABEL[k]?.zh : SENTIMENT_LABEL[k]?.en} <span>{counts.get(k)}</span>
            </button>
          ))}
        </div>
      ) : null}

      {articles.length === 0 ? (
        <div className="kz-card kz-feed-empty">
          <p className="kz-feed-empty-title">{emptyTitle}</p>
          <p className="kz-feed-empty-copy">{emptyCopy}</p>
        </div>
      ) : (
        <ol className="kz-feed-list">
          {visible.map((a, i) => (
            <li key={a.id}>
              <ArticleCard a={a} prefetch={i === 0} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
