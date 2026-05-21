"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function SearchBox({
  initialQuery,
  initialSort,
}: {
  initialQuery: string;
  initialSort: "hot" | "recent";
}) {
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
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(q, sort);
      }}
      className="flex flex-col sm:flex-row gap-2"
    >
      <div className="relative flex-1">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
          width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          ref={inputRef}
          autoFocus
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search titles, summaries, topics…   (⌘K)"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-ink-200 dark:border-ink-700 bg-white/70 dark:bg-ink-900/40 focus:border-accent focus:ring-2 focus:ring-accent/30 outline-none transition"
        />
      </div>
      <div className="flex gap-1 p-1 rounded-xl border border-ink-200 dark:border-ink-700 bg-white/60 dark:bg-ink-900/40 self-stretch sm:self-auto">
        {(["hot", "recent"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setSort(s);
              submit(q, s);
            }}
            className={`px-3 py-1.5 text-xs rounded-md font-medium transition ${
              sort === s
                ? "bg-accent text-white"
                : "text-ink-600 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-800"
            }`}
          >
            {s === "hot" ? "🔥 Hot" : "🕒 Recent"}
          </button>
        ))}
      </div>
      <button
        type="submit"
        className="px-4 py-2.5 rounded-xl fire-gradient text-white font-semibold shadow hover:shadow-md transition"
      >
        Search
      </button>
    </form>
  );
}
