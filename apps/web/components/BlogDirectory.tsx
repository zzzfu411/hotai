"use client";

import { useMemo, useState } from "react";
import { BLOG_TAGS } from "@/lib/constants";
import { useLang } from "./LangContext";
import { BlogCard, type BlogCardData } from "./BlogCard";

export function BlogDirectory({ blogs }: { blogs: BlogCardData[] }) {
  const { lang } = useLang();
  const zh = lang === "zh";
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [featuredOnly, setFeaturedOnly] = useState(false);

  const availableTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of blogs) {
      for (const t of b.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
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
    <div className="ha-blog-dir">
      <div className="ha-filters-row">
        <div className="ha-search ha-search-wide">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={zh ? "搜索作者、博客或主题…" : "Search authors, blogs, or topics…"}
            className="ha-input"
            aria-label={zh ? "搜索博客" : "Search blogs"}
          />
          <span className="ha-search-go" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </span>
        </div>
        <button
          type="button"
          onClick={() => setFeaturedOnly((v) => !v)}
          className={featuredOnly ? "ha-btn active" : "ha-btn"}
          aria-pressed={featuredOnly}
        >
          {zh ? `仅精选 · ${featuredCount}` : `Featured · ${featuredCount}`}
        </button>
      </div>

      <div className="ha-filter-tags">
        <button
          type="button"
          onClick={() => setActiveTag(null)}
          className={activeTag === null ? "ha-chip active" : "ha-chip"}
          aria-pressed={activeTag === null}
        >
          {zh ? "全部" : "All"}
          <span>{blogs.length}</span>
        </button>
        {availableTags.map((t) => {
          const active = activeTag === t.slug;
          return (
            <button
              key={t.slug}
              type="button"
              onClick={() => setActiveTag(active ? null : t.slug)}
              className={active ? "ha-chip active" : "ha-chip"}
              aria-pressed={active}
            >
              {zh ? t.label_zh : t.label_en}
              <span>{t.count}</span>
            </button>
          );
        })}
      </div>

      <p className="ha-blog-meta">
        {zh
          ? `显示 ${filtered.length} / ${blogs.length} 个博客`
          : `Showing ${filtered.length} of ${blogs.length} blogs`}
      </p>

      {filtered.length === 0 ? (
        <div className="ha-card ha-feed-empty ha-blog-empty">
          <p className="font-bold">{zh ? "没有匹配的博客" : "No blogs match"}</p>
          <p>{zh ? "试试换个关键词。" : "Try another filter."}</p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setActiveTag(null);
              setFeaturedOnly(false);
            }}
            className="ha-btn"
          >
            {zh ? "清除筛选" : "Clear filters"}
          </button>
        </div>
      ) : (
        <div className="ha-blog-grid">
          {filtered.map((b) => (
            <BlogCard key={b.slug} blog={b} />
          ))}
        </div>
      )}
    </div>
  );
}
