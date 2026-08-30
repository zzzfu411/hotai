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
}: {
  articles: ArticleCardData[];
  ranked?: boolean;
  titleZh?: string;
  titleEn?: string;
  kickerZh?: string;
  kickerEn?: string;
  titleAs?: "h1" | "h2";
  action?: ReactNode;
}) {
  const { lang } = useLang();
  const zh = lang === "zh";
  const title = zh ? titleZh : titleEn;
  const kicker = zh ? kickerZh ?? kickerEn : kickerEn ?? kickerZh;
  const TitleTag = titleAs;
  const showHead = Boolean(title || kicker || action);

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
          <p className="font-bold">{zh ? "暂无文章" : "No articles yet"}</p>
          <p>
            {zh
              ? "抓取器可能还在预热，稍后再刷新。"
              : "The fetcher may still be warming up. Refresh in a minute."}
          </p>
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
