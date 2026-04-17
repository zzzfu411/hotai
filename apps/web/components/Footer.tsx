"use client";

import { useLang } from "./LangContext";
import { SITE } from "@/lib/constants";

export function Footer() {
  const { lang } = useLang();
  return (
    <footer className="border-t border-ink-200 dark:border-ink-800 mt-10">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 text-xs text-ink-600 dark:text-ink-300 flex flex-wrap gap-3 justify-between">
        <span>© {new Date().getFullYear()} {SITE.name}</span>
        <span>
          {lang === "zh"
            ? "数据聚合自公开 RSS、HuggingFace、GitHub 等来源。"
            : "Aggregated from public RSS, HuggingFace, GitHub and other sources."}
        </span>
      </div>
    </footer>
  );
}
