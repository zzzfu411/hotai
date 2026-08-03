"use client";

import { useMemo, useState } from "react";
import { BLOG_TAGS } from "@/lib/constants";
import { useLang } from "./LangContext";
import { BlogCard, type BlogCardData } from "./BlogCard";

export function BlogDirectory({ blogs }: { blogs: BlogCardData[] }) {
  const { lang } = useLang();
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [featuredOnly, setFeaturedOnly] = useState(false);

  const availableTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of blogs) {
      for (const t of b.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    // Prefer canonical order from BLOG_TAGS; append any extras.
    const knownOrder = BLOG_TAGS.map((t) => t.slug as string);
    const known = knownOrder.filter((s) => counts.has(s));
    const extra = [...counts.keys()].filter((s) => !known.includes(s)).sort();
    return [...known, ...extra].map((slug) => {
      const meta = BLOG_TAGS.find((t) => t.slug === slug);
      return {
        slug,
        count: counts.get(slug) ?? 0,
        label_en: meta?.label_en ?? slug,
        label_zh: meta?.label_zh ?? slug,
      };
    });
  }, [blogs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return blogs.filter((b) => {
      if (featuredOnly && !b.featured) return false;
      if (activeTag && !b.tags.includes(activeTag)) return false;
      if (!q) return true;
      const hay = [
        b.name,
        b.author,
        b.affiliation ?? "",
        b.bioEn,
        b.bioZh,
        b.tags.join(" "),
        b.guideHowEn ?? "",
        b.guideHowZh ?? "",
        b.guideTimelineEn ?? "",
        b.guideTimelineZh ?? "",
        b.guideCadenceEn ?? "",
        b.guideCadenceZh ?? "",
        ...b.guideStartHere.map((s) => `${s.title} ${s.noteEn ?? ""} ${s.noteZh ?? ""}`),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [blogs, query, activeTag, featuredOnly]);

  const featuredCount = blogs.filter((b) => b.featured).length;

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              lang === "zh"
                ? "搜索作者、博客或主题…"
                : "Search authors, blogs, or topics…"
            }
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-ink-200 dark:border-ink-700 bg-white/70 dark:bg-ink-900/50 text-sm placeholder:text-ink-400 focus:border-accent focus:ring-1 focus:ring-accent/40 outline-none transition"
            aria-label={lang === "zh" ? "搜索博客" : "Search blogs"}
          />
        </div>
        <button
          type="button"
          onClick={() => setFeaturedOnly((v) => !v)}
          className={`inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold border transition shrink-0 ${
            featuredOnly
              ? "border-ember-500/50 bg-ember-50 dark:bg-ember-900/30 text-ember-700 dark:text-ember-200"
              : "border-ink-200 dark:border-ink-700 text-ink-600 dark:text-ink-300 hover:border-accent hover:text-accent"
          }`}
        >
          <span aria-hidden>✶</span>
          {lang === "zh" ? `仅精选 · ${featuredCount}` : `Featured · ${featuredCount}`}
        </button>
      </div>

      {/* Tag chips */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setActiveTag(null)}
          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
            activeTag === null
              ? "border-accent/50 bg-accent/10 text-accent-deep dark:text-accent"
              : "border-ink-200 dark:border-ink-700 text-ink-600 dark:text-ink-300 hover:border-accent hover:text-accent"
          }`}
        >
          {lang === "zh" ? "全部" : "All"}
          <span className="ml-1 tabular-nums opacity-70">{blogs.length}</span>
        </button>
        {availableTags.map((t) => {
          const active = activeTag === t.slug;
          return (
            <button
              key={t.slug}
              type="button"
              onClick={() => setActiveTag(active ? null : t.slug)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                active
                  ? "border-accent/50 bg-accent/10 text-accent-deep dark:text-accent"
                  : "border-ink-200 dark:border-ink-700 text-ink-600 dark:text-ink-300 hover:border-accent hover:text-accent"
              }`}
            >
              {lang === "zh" ? t.label_zh : t.label_en}
              <span className="ml-1 tabular-nums opacity-70">{t.count}</span>
            </button>
          );
        })}
      </div>

      {/* Result meta */}
      <p className="mt-4 text-xs text-ink-500 dark:text-ink-400 tabular-nums">
        {lang === "zh"
          ? `显示 ${filtered.length} / ${blogs.length} 个博客`
          : `Showing ${filtered.length} of ${blogs.length} blogs`}
      </p>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="mt-8 card-surface p-10 text-center">
          <p className="text-ink-500 dark:text-ink-400">
            {lang === "zh" ? "没有匹配的博客，试试换个关键词。" : "No blogs match — try another filter."}
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setActiveTag(null);
              setFeaturedOnly(false);
            }}
            className="mt-3 text-sm font-semibold text-accent hover:underline"
          >
            {lang === "zh" ? "清除筛选" : "Clear filters"}
          </button>
        </div>
      ) : (
        <div className="mt-5 grid sm:grid-cols-2 gap-4">
          {filtered.map((b, i) => (
            <BlogCard key={b.slug} blog={b} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
