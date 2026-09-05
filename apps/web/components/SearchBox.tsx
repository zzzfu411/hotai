"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useLang } from "./LangContext";

export function SearchBox({
  initialQuery,
  initialSort,
  resultCount = null,
  unavailable = false,
  queryTooShort = false,
}: {
  initialQuery: string;
  initialSort: "hot" | "recent";
  resultCount?: number | null;
  unavailable?: boolean;
  queryTooShort?: boolean;
}) {
  const { lang } = useLang();
  const zh = lang === "zh";
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(initialQuery);
  const [sort, setSort] = useState<"hot" | "recent">(initialSort);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setQ(initialQuery); setSort(initialSort); }, [initialQuery, initialSort]);

  // ⌘K / Ctrl+K focuses the input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = (next: string, nextSort: "hot" | "recent") => {
    const params = new URLSearchParams(sp.toString());
    if (next) params.set("q", next);
    else params.delete("q");
    if (nextSort === "recent") params.set("sort", "recent");
    else params.delete("sort");
    params.delete("page");
    router.push(`/search?${params.toString()}`);
  };

  return (
    <header className="kz-page-head">
      <div>
        <p className="kz-page-kicker">{zh ? "搜索" : "Search"}</p>
        <h1 className="kz-page-title">{zh ? "搜标题、摘要、主题" : "Titles, summaries, topics"}</h1>
        <p className="kz-page-lede">
          {zh
            ? "范围：Hot AI 最近 14 天入库文章；首页的实时速闻不在此索引中。"
            : "Scope: Hot AI articles stored in the last 14 days. The live feed is not indexed here."}
        </p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(q, sort);
        }}
        className="kz-search-form"
        role="search"
      >
        <div className="kz-search kz-search-wide">
          <input
            ref={inputRef}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={zh ? "搜索标题、摘要、主题…  (⌘K)" : "Search titles, summaries, topics…  (⌘K)"}
            className="kz-input"
            aria-label={zh ? "搜索" : "Search"}
          />
          <button type="submit" className="kz-search-go" aria-label={zh ? "搜索" : "Search"}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </button>
        </div>
        <div className="kz-sort" role="group" aria-label={zh ? "排序" : "Sort"}>
          {(["hot", "recent"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setSort(s);
                submit(q, s);
              }}
              className={sort === s ? "kz-tab active" : "kz-tab"}
              aria-pressed={sort === s}
            >
              {s === "hot" ? (zh ? "热度" : "Hot") : zh ? "最新" : "Recent"}
            </button>
          ))}
        </div>
      </form>
      {queryTooShort && (
        <div className="kz-card kz-feed-empty" role="status">
          <p className="kz-feed-empty-title">
            {zh ? "关键词太短" : "That query is too short"}
          </p>
          <p className="kz-feed-empty-copy">
            {zh ? "请输入至少 2 个字符再搜索。" : "Enter at least 2 characters to search."}
          </p>
        </div>
      )}
      {resultCount != null && (
        <p className="kz-search-count">
          {zh
            ? `本页 ${resultCount} 条结果 · 「${initialQuery}」`
            : `${resultCount} results on this page for “${initialQuery}”`}
        </p>
      )}
      {unavailable && (
        <div className="kz-card kz-feed-empty" role="status">
          <p className="font-bold">
            {zh ? "搜索服务暂时不可用" : "Search is temporarily unavailable"}
          </p>
          <p>
            {zh
              ? "内容服务暂时不可用，请稍后重试。"
              : "The content service is unavailable. Please try again shortly."}
          </p>
        </div>
      )}
    </header>
  );
}
