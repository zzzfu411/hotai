"use client";

import Image from "next/image";
import { useLang } from "./LangContext";
import { SITE } from "@/lib/constants";

type Stat = { label_en: string; label_zh: string; value: string | number };

export function Hero({ stats }: { stats?: Stat[] }) {
  const { lang } = useLang();
  return (
    <section className="relative overflow-hidden rounded-3xl border border-ink-200/70 dark:border-ink-800/70 bg-gradient-to-br from-white via-white to-ember-50/40 dark:from-ink-900/60 dark:via-ink-950 dark:to-ink-900/40 p-6 sm:p-9">
      {/* Glow blobs */}
      <div
        className="absolute -top-24 -right-24 w-72 h-72 rounded-full fire-gradient opacity-30 blur-3xl pointer-events-none animate-pulse-flame"
        aria-hidden
      />
      <div
        className="absolute -bottom-32 -left-20 w-72 h-72 rounded-full bg-fuchsia-500 opacity-10 blur-3xl pointer-events-none"
        aria-hidden
      />
      <Image
        src="/hero-spark.svg"
        alt=""
        width={480}
        height={360}
        aria-hidden
        className="hidden sm:block absolute top-5 right-4 w-[40%] max-w-sm h-auto opacity-70 dark:opacity-80 pointer-events-none"
      />

      {/* Top label */}
      <div className="relative flex items-center gap-2 text-[11px] font-semibold tracking-widest uppercase text-ember-700 dark:text-ember-200">
        <span className="w-1.5 h-1.5 rounded-full bg-ember-500 animate-pulse" aria-hidden />
        {lang === "zh" ? "AI 热点 · 每小时刷新" : "AI Pulse · Hourly Refresh"}
      </div>

      <h1 className="relative mt-3 text-3xl sm:text-5xl font-extrabold tracking-tight leading-[1.05]">
        {lang === "zh" ? (
          <>
            一份给 <span className="fire-text">认真做 AI 的人</span> 的<br className="hidden sm:block" />
            每日热度榜。
          </>
        ) : (
          <>
            The daily heat-map of{" "}
            <span className="fire-text">what actually matters</span> in AI.
          </>
        )}
      </h1>

      <p className="relative mt-4 text-sm sm:text-base text-ink-600 dark:text-ink-300 max-w-2xl">
        {lang === "zh"
          ? "聚合 arXiv、OpenAI、Anthropic、HuggingFace、GitHub、机器之心、量子位 等数十个来源,Claude 自动撮要 + 主题聚类 + 重要度评分。"
          : "Aggregating arXiv, OpenAI, Anthropic, HuggingFace, GitHub, and dozens of Chinese & English sources — auto-summarised, clustered, and importance-ranked by Claude."}
      </p>

      {stats && stats.length > 0 && (
        <dl className="relative mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {stats.map((s, i) => (
            <div
              key={i}
              className="rounded-xl border border-ink-200/70 dark:border-ink-800/70 bg-white/70 dark:bg-ink-900/40 backdrop-blur-sm px-3 py-2.5"
            >
              <dt className="text-[11px] uppercase tracking-wider text-ink-500 dark:text-ink-400">
                {lang === "zh" ? s.label_zh : s.label_en}
              </dt>
              <dd className="mt-0.5 text-xl font-bold tabular-nums">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="relative mt-5 flex items-center gap-2 text-xs">
        <a
          href={`/digest`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full fire-gradient text-white font-semibold shadow-sm hover:shadow-md hover:shadow-ember-500/30 transition"
        >
          <span aria-hidden>✶</span>
          {lang === "zh" ? "今日 AI 简报" : "Today's AI Brief"}
        </a>
        <a
          href={`/search`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-ink-200 dark:border-ink-700 hover:border-accent hover:text-accent transition"
        >
          {lang === "zh" ? "搜索 · " : "Search · "}
          <kbd className="font-mono text-[10px] text-ink-500">⌘ K</kbd>
        </a>
      </div>
    </section>
  );
}
