"use client";

import type { ReactNode } from "react";
import { ArticleCard, type ArticleCardData } from "./ArticleCard";
import { useLang } from "./LangContext";

export function FeedList({
  articles,
  ranked = false,
  titleZh,
  titleEn,
  kickerZh,
  kickerEn,
  titleAs = "h1",
  action,
  emptyTitleZh,
  emptyTitleEn,
  emptyCopyZh,
  emptyCopyEn,
}: {
  articles: ArticleCardData[];
  ranked?: boolean;
  titleZh?: string;
  titleEn?: string;
  kickerZh?: string;
  kickerEn?: string;
  titleAs?: "h1" | "h2";
  action?: ReactNode;
  emptyTitleZh?: string;
  emptyTitleEn?: string;
  emptyCopyZh?: string;
  emptyCopyEn?: string;
}) {
  const { lang } = useLang();
  const zh = lang === "zh";
  const title = zh ? titleZh : titleEn;
  const kicker = zh ? kickerZh ?? kickerEn : kickerEn ?? kickerZh;
  const TitleTag = titleAs;
  const showHead = Boolean(title || kicker || action);
  const emptyTitle = zh ? emptyTitleZh ?? "暂无文章" : emptyTitleEn ?? "No articles yet";
  const emptyCopy = zh
    ? emptyCopyZh ?? "抓取器可能还在预热，稍后再刷新。"
    : emptyCopyEn ?? "The fetcher may still be warming up. Refresh in a minute.";

  return (
    <section className="kz-feed">
      {showHead ? (
        <header className="kz-feed-head">
          <div>
            {kicker ? <p className="kz-page-kicker">{kicker}</p> : null}
            {title ? <TitleTag className="kz-feed-title">{title}</TitleTag> : null}
          </div>
          <div className="kz-feed-head-end">
            {action}
            <p className="kz-feed-count">
              {articles.length}
              {zh ? " 篇" : articles.length === 1 ? " story" : " stories"}
            </p>
          </div>
        </header>
      ) : null}

      {articles.length === 0 ? (
        <div className="kz-card kz-feed-empty">
          <p className="kz-feed-empty-title">{emptyTitle}</p>
          <p className="kz-feed-empty-copy">{emptyCopy}</p>
        </div>
      ) : (
        <div className="kz-feed-list">
          {articles.map((a, i) => (
            <ArticleCard key={a.id} a={{ ...a, rank: ranked ? i + 1 : undefined }} />
          ))}
        </div>
      )}
    </section>
  );
}
