"use client";

import { useLang } from "./LangContext";

export function BlogHero({ total, featured }: { total: number; featured: number }) {
  const { lang } = useLang();

  return (
    <header className="relative overflow-hidden rounded-3xl border border-ink-200/70 dark:border-ink-800/70 bg-gradient-to-br from-white via-white to-violet-50/50 dark:from-ink-900/60 dark:via-ink-950 dark:to-ink-900/40 p-6 sm:p-9">
      <div
        className="absolute -top-20 -right-16 w-64 h-64 rounded-full bg-violet-500 opacity-15 blur-3xl pointer-events-none"
        aria-hidden
      />
      <div
        className="absolute -bottom-24 -left-12 w-56 h-56 rounded-full fire-gradient opacity-20 blur-3xl pointer-events-none"
        aria-hidden
      />

      <div className="relative flex items-center gap-2 text-[11px] font-semibold tracking-widest uppercase text-violet-700 dark:text-violet-300">
        <span className="w-1.5 h-1.5 rounded-full bg-violet-500" aria-hidden />
        {lang === "zh" ? "精选目录 · 长期收录" : "Curated · Evergreen"}
      </div>

      <h1 className="relative mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">
        {lang === "zh" ? (
          <>
            AI 领域值得长期订阅的{" "}
            <span className="fire-text">高质量博客</span>
          </>
        ) : (
          <>
            High-signal blogs from{" "}
            <span className="fire-text">people who build AI</span>
          </>
        )}
      </h1>

      <p className="relative mt-3 text-sm sm:text-base text-ink-600 dark:text-ink-300 max-w-2xl leading-relaxed">
        {lang === "zh"
          ? "不是新闻热榜，而是编辑精选的研究员与从业者博客。每张卡片都有「食用指南」：更新节奏、怎么读、内容时间线、推荐从哪篇开始。与 14 天热度文章分开，这里永久收录。"
          : "Not the hourly heat list — an editorial shortlist of researcher and practitioner blogs. Every card has a reading guide: cadence, how to read, content timeline, and where to start. Permanent; outside the 14-day news window."}
      </p>

      <dl className="relative mt-5 flex flex-wrap gap-3">
        <div className="rounded-xl border border-ink-200/70 dark:border-ink-800/70 bg-white/70 dark:bg-ink-900/40 backdrop-blur-sm px-3.5 py-2">
          <dt className="text-[11px] uppercase tracking-wider text-ink-500 dark:text-ink-400">
            {lang === "zh" ? "收录" : "Listed"}
          </dt>
          <dd className="text-lg font-bold tabular-nums">{total}</dd>
        </div>
        <div className="rounded-xl border border-ink-200/70 dark:border-ink-800/70 bg-white/70 dark:bg-ink-900/40 backdrop-blur-sm px-3.5 py-2">
          <dt className="text-[11px] uppercase tracking-wider text-ink-500 dark:text-ink-400">
            {lang === "zh" ? "精选" : "Featured"}
          </dt>
          <dd className="text-lg font-bold tabular-nums">{featured}</dd>
        </div>
      </dl>
    </header>
  );
}
