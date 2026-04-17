"use client";

import { useLang } from "./LangContext";

export function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <button
      type="button"
      onClick={() => setLang(lang === "en" ? "zh" : "en")}
      className="px-2.5 py-1 text-xs font-medium rounded-md border border-ink-200 dark:border-ink-700 hover:bg-ink-100 dark:hover:bg-ink-800 transition"
      aria-label="Toggle language"
    >
      {lang === "en" ? "中文" : "EN"}
    </button>
  );
}
