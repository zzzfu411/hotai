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
  summary: string | null;
  publishedAt: string; // ISO
  score: number;
  lang: string;
  tags: string[];
  source: { slug: string; name: string };
  // AI enrichment — optional
  aiSummaryEn?: string | null;
  aiSummaryZh?: string | null;
  aiTopics?: string[];
  aiSentiment?: string | null;
  aiImportance?: number | null;
};

const SENTIMENT_LABEL: Record<string, { en: string; zh: string; cls: string }> = {
  release:  { en: "Release",   zh: "发布",   cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" },
  research: { en: "Research",  zh: "研究",   cls: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30" },
  opinion:  { en: "Opinion",   zh: "观点",   cls: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30" },
  rumor:    { en: "Rumor",     zh: "传闻",   cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" },
  tutorial: { en: "Tutorial",  zh: "教程",   cls: "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30" },
  other:    { en: "Other",     zh: "其他",   cls: "bg-ink-200/40 text-ink-600 dark:text-ink-300 border-ink-200/60 dark:border-ink-700" },
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
  const rank = a.rank ?? 0;
  const rankColor =
    rank === 1 ? "text-ember-600" : rank <= 3 ? "text-ember-500" : "text-ink-400 dark:text-ink-500";
  const fav = faviconFor(a.url);
  const summary = (lang === "zh" ? a.aiSummaryZh : a.aiSummaryEn) || a.summary;
  const sentiment = a.aiSentiment ? SENTIMENT_LABEL[a.aiSentiment] : null;
  const importance = a.aiImportance ?? 0;
  const isHot = importance >= 0.75 || (rank > 0 && rank <= 3);

  return (
    <article className="group relative flex gap-3 sm:gap-4 py-4 border-b border-ink-200/60 dark:border-ink-800/60 last:border-b-0 animate-fade-up">
      {rank > 0 && (
        <div className={`w-8 flex-none text-xl sm:text-2xl font-black tabular-nums leading-none pt-1 ${rankColor}`}>
          {rank.toString().padStart(2, "0")}
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          {fav && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={fav}
              alt=""
              width={16}
              height={16}
              loading="lazy"
              className="mt-1.5 w-4 h-4 rounded shrink-0 opacity-80"
              onError={(e) => {
                const img = e.currentTarget;
                if (img.src.endsWith("/source-fallback.svg")) {
                  img.style.display = "none";
                  return;
                }
                img.src = "/source-fallback.svg";
              }}
            />
          )}
          <a
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block flex-1 text-base sm:text-lg font-semibold leading-snug group-hover:text-accent transition"
          >
            {a.title}
            {isHot && (
              <span className="ml-1.5 inline-block align-middle text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded fire-gradient text-white">
                🔥 hot
              </span>
            )}
          </a>
        </div>

        {summary && (
          <p className="mt-1.5 text-sm text-ink-600 dark:text-ink-300 line-clamp-2 leading-relaxed">
            {a.aiSummaryEn || a.aiSummaryZh ? (
              <span className="text-ember-700/80 dark:text-ember-300/90 mr-1 font-mono text-[10px] tracking-wider uppercase">
                AI·
              </span>
            ) : null}
            {summary}
          </p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-600 dark:text-ink-400">
          <Link
            href={`/source/${a.source.slug}`}
            className="font-medium hover:text-accent"
          >
            {a.source.name}
          </Link>
          <span className="text-ink-300 dark:text-ink-700">·</span>
          <span className="text-ink-500 dark:text-ink-500">{hostname(a.url)}</span>
          <span className="text-ink-300 dark:text-ink-700">·</span>
          <time dateTime={a.publishedAt}>{timeAgo(date, lang)}</time>
          <span className="text-ink-300 dark:text-ink-700">·</span>
          <span className="inline-flex items-center gap-0.5">
            <span className="text-accent" aria-hidden>🔥</span>
            <span className="tabular-nums font-medium">{formatScore(a.score)}</span>
          </span>
          {sentiment && (
            <span className={`chip gap-1 ${sentiment.cls}`}>
              <span
                className="inline-block h-3.5 w-3.5 bg-current"
                style={iconMask(`/sentiment/${a.aiSentiment}.svg`)}
                aria-hidden
              />
              {lang === "zh" ? sentiment.zh : sentiment.en}
            </span>
          )}
          {(a.aiTopics?.length ? a.aiTopics : a.tags).slice(0, 3).map((t) => (
            <Link
              key={t}
              href={`/search?q=${encodeURIComponent(t)}`}
              className="chip-soft hover:border-accent hover:text-accent transition"
            >
              {t}
            </Link>
          ))}
        </div>
      </div>
    </article>
  );
}
