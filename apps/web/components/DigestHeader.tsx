"use client";

import { useLang } from "./LangContext";

type Loaded = {
  headline: string;
  overview: string;
  themes: string[];
  model?: string | null;
  createdAt: Date | string;
} | null;

export function DigestHeader({ digest, aiEnabled }: { digest: Loaded; aiEnabled: boolean }) {
  const { lang } = useLang();
  if (!digest) {
    return (
      <div className="card-surface p-6 sm:p-8 text-center">
        <div className="inline-block w-12 h-12 rounded-full fire-gradient opacity-50 mb-3 animate-pulse-flame" />
        <h1 className="text-xl font-bold">
          {lang === "zh" ? "今日简报正在生成…" : "No brief yet for today."}
        </h1>
        <p className="mt-2 text-sm text-ink-500 max-w-md mx-auto">
          {aiEnabled
            ? lang === "zh"
              ? "至少需要 5 篇当日入库文章。等下一次抓取后回来再看看。"
              : "We need at least 5 articles from today to draft a brief. Check back after the next fetch cycle."
            : lang === "zh"
              ? "未配置 ANTHROPIC_API_KEY,AI 简报功能未启用。"
              : "AI brief is disabled — set ANTHROPIC_API_KEY to enable it."}
        </p>
      </div>
    );
  }
  const created = new Date(digest.createdAt);
  return (
    <header className="relative overflow-hidden card-surface p-6 sm:p-10">
      <div
        className="absolute -top-24 -right-24 w-64 h-64 rounded-full fire-gradient opacity-30 blur-3xl pointer-events-none"
        aria-hidden
      />
      <p className="relative flex items-center gap-2 text-[11px] font-semibold tracking-widest uppercase text-ember-700 dark:text-ember-200">
        <span aria-hidden>✶</span>
        {lang === "zh" ? "今日 AI 简报" : "Today's AI Brief"}
        <span className="text-ink-400 dark:text-ink-500 font-normal normal-case">
          · {created.toUTCString().slice(0, 16)} UTC
          {digest.model ? ` · ${digest.model}` : ""}
        </span>
      </p>
      <h1 className="relative mt-3 text-2xl sm:text-4xl font-extrabold tracking-tight leading-tight">
        {digest.headline}
      </h1>
      <p className="relative mt-4 text-base text-ink-700 dark:text-ink-200 leading-relaxed max-w-3xl">
        {digest.overview}
      </p>
      {digest.themes.length > 0 && (
        <div className="relative mt-5 flex flex-wrap gap-1.5">
          {digest.themes.map((t) => (
            <a
              key={t}
              href={`/search?q=${encodeURIComponent(t)}`}
              className="chip-accent hover:brightness-110 transition"
            >
              #{t}
            </a>
          ))}
        </div>
      )}
    </header>
  );
}
