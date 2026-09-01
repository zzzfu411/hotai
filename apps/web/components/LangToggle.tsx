"use client";

import { useLang } from "./LangContext";

export function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <button
      type="button"
      onClick={() => setLang(lang === "en" ? "zh" : "en")}
      className="ha-btn"
      aria-label={lang === "en" ? "切换为中文" : "Switch to English"}
      title={lang === "en" ? "切换为中文" : "Switch to English"}
    >
      {lang === "en" ? "中文" : "EN"}
    </button>
  );
}
