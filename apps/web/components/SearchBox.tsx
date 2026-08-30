"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useLang } from "./LangContext";

export function SearchBox({
  initialQuery,
  initialSort,
  resultCount = null,
}: {
  initialQuery: string;
  initialSort: "hot" | "recent";
  resultCount?: number | null;
}) {
  const { lang } = useLang();
  const zh = lang === "zh";
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(initialQuery);
  const [sort, setSort] = useState<"hot" | "recent">(initialSort);
  const inputRef = useRef<HTMLInputElement>(null);

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
    router.push(`/search?${params.toString()}`);
  };

  return (
    <header className="kz-page-head">
      <div>
        <p className="kz-page-kicker">{zh ? "搜索" : "Search"}</p>
        <h1 className="kz-page-title">{zh ? "搜标题、摘要、主题" : "Titles, summaries, topics"}</h1>
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
            autoFocus
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
      {resultCount != null && (
        <p className="kz-search-count">
          {zh
            ? `${resultCount} 条结果 · 「${initialQuery}」`
            : `${resultCount} result${resultCount === 1 ? "" : "s"} for “${initialQuery}”`}
        </p>
      )}
    </header>
  );
}
