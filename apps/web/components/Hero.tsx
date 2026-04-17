"use client";

import { useLang } from "./LangContext";
import { SITE } from "@/lib/constants";

export function Hero() {
  const { lang } = useLang();
  return (
    <div className="relative overflow-hidden rounded-2xl border border-ink-200 dark:border-ink-800 p-6 sm:p-8">
      <div
        className="absolute -top-20 -right-20 w-64 h-64 rounded-full fire-gradient opacity-20 blur-3xl pointer-events-none"
        aria-hidden
      />
      <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
        <span className="fire-gradient bg-clip-text text-transparent">{SITE.name}</span>
      </h1>
      <p className="mt-2 text-sm sm:text-base text-ink-600 dark:text-ink-300 max-w-xl">
        {lang === "zh" ? SITE.tagline_zh : SITE.tagline_en}
      </p>
      <p className="mt-3 text-xs text-ink-600 dark:text-ink-300">
        {lang === "zh"
          ? "每小时自动聚合 arXiv、OpenAI、Anthropic、HuggingFace、GitHub、机器之心、量子位 等数十个来源。"
          : "Hourly aggregation of arXiv, OpenAI, Anthropic, HuggingFace, GitHub, and dozens more."}
      </p>
    </div>
  );
}
