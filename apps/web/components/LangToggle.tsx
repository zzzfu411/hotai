"use client";

import { useLang } from "./LangContext";

export function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <button
      type="button"
      onClick={() => setLang(lang === "en" ? "zh" : "en")}
      className="kz-btn"
      aria-label="Toggle language"
    >
      {lang === "en" ? "中文" : "EN"}
    </button>
  );
}
