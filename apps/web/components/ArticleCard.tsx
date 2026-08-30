"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { formatScore, hostname, timeAgo } from "@/lib/format";
import { useLang } from "./LangContext";

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

const SENTIMENT_LABEL: Record<string, { en: string; zh: string }> = {
  release: { en: "Release", zh: "发布" },
  research: { en: "Research", zh: "研究" },
  opinion: { en: "Opinion", zh: "观点" },
  rumor: { en: "Rumor", zh: "传闻" },
  tutorial: { en: "Tutorial", zh: "教程" },
  other: { en: "Other", zh: "其他" },
};

function faviconFor(url: string) {
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })();
  if (!host) return null;
  return `https://www.google.com/s2/favicons?sz=32&domain=${host}`;
}

function iconMask(path: string): CSSProperties {
  const value = `url(${path}) center / contain no-repeat`;
  return { WebkitMask: value, mask: value };
}

export function ArticleCard({ a }: { a: ArticleCardData }) {
  const { lang } = useLang();
  const date = new Date(a.publishedAt);
  const rank = a.rank && a.rank > 0 ? a.rank : 0;
  const fav = faviconFor(a.url);
  const summary = (lang === "zh" ? a.aiSummaryZh : a.aiSummaryEn) || a.summary;
  const sentiment = a.aiSentiment ? SENTIMENT_LABEL[a.aiSentiment] : null;
  const readerHref = a.href ?? `/a/${a.id}`;
  const host = hostname(a.url);
  const topics = (a.aiTopics?.length ? a.aiTopics : a.tags).slice(0, 3);
  const cross = a.crossPostCount ?? 0;

  return (
    <article className="kz-card kz-article">
      {rank > 0 ? (
        <div className={rank <= 3 ? "kz-rank kz-rank-top" : "kz-rank"}>
          {rank.toString().padStart(2, "0")}
        </div>
      ) : null}

      <div className="kz-article-body">
        <Link href={readerHref} className="kz-article-main">
          <span className="kz-article-title-row">
            {fav ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={fav}
                alt=""
                width={16}
                height={16}
                loading="lazy"
                className="kz-article-fav"
                onError={(e) => {
                  const img = e.currentTarget;
                  if (img.src.endsWith("/source-fallback.svg")) {
                    img.style.display = "none";
                    return;
                  }
                  img.src = "/source-fallback.svg";
                }}
              />
            ) : null}
            <span className="kz-article-title">{a.title}</span>
          </span>
          {summary ? <span className="kz-article-summary">{summary}</span> : null}
        </Link>

        <div className="kz-article-meta">
          <Link href={`/source/${a.source.slug}`} className="kz-chip">
            {a.source.name}
          </Link>
          <a
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            className="kz-chip kz-host"
            title={lang === "zh" ? "打开原文" : "Open original"}
          >
            {host}
          </a>
          <time dateTime={a.publishedAt}>{timeAgo(date, lang)}</time>
          <span className="kz-article-score font-mono tabular-nums">{formatScore(a.score)}</span>
          {cross > 0 ? (
            <span
              className="kz-chip"
              title={lang === "zh" ? "其他来源转载了同一新闻" : "Also reported by other sources"}
            >
              ⇄ {lang === "zh" ? `${cross} 源转载` : `+${cross}`}
            </span>
          ) : null}
          {sentiment ? (
            <span className="kz-chip">
              <span
                className="kz-sentiment-icon"
                style={iconMask(`/sentiment/${a.aiSentiment}.svg`)}
                aria-hidden
              />
              {lang === "zh" ? sentiment.zh : sentiment.en}
            </span>
          ) : null}
          {topics.map((t) => (
            <Link key={t} href={`/search?q=${encodeURIComponent(t)}`} className="kz-chip">
              {t}
            </Link>
          ))}
        </div>
      </div>
    </article>
  );
}
