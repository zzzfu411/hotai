"use client";

import Link from "next/link";
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
};

export function ArticleCard({ a }: { a: ArticleCardData }) {
  const { lang } = useLang();
  const date = new Date(a.publishedAt);
  const rank = a.rank ?? 0;
  const rankColor =
    rank === 1 ? "text-accent-deep" : rank <= 3 ? "text-accent" : "text-ink-600 dark:text-ink-300";
  return (
    <article className="group flex gap-4 py-4 border-b border-ink-200/60 dark:border-ink-800/60 last:border-b-0">
      {rank > 0 && (
        <div className={`w-7 flex-none text-xl font-bold tabular-nums ${rankColor}`}>
          {rank}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <a
          href={a.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-base sm:text-lg font-semibold leading-snug group-hover:text-accent transition"
        >
          {a.title}
        </a>
        {a.summary && (
          <p className="mt-1 text-sm text-ink-600 dark:text-ink-300 line-clamp-2">
            {a.summary}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-600 dark:text-ink-300">
          <Link
            href={`/source/${a.source.slug}`}
            className="font-medium hover:text-accent"
          >
            {a.source.name}
          </Link>
          <span className="text-ink-300 dark:text-ink-600">·</span>
          <span>{hostname(a.url)}</span>
          <span className="text-ink-300 dark:text-ink-600">·</span>
          <time dateTime={a.publishedAt}>{timeAgo(date, lang)}</time>
          <span className="text-ink-300 dark:text-ink-600">·</span>
          <span className="inline-flex items-center gap-0.5">
            <span className="text-accent">🔥</span>
            <span className="tabular-nums">{formatScore(a.score)}</span>
          </span>
          {a.tags.slice(0, 3).map((t) => (
            <span
              key={t}
              className="px-1.5 py-0.5 rounded bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300"
            >
              {t}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}
