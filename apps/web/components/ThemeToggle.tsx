"use client";

import { useEffect, useState } from "react";
import { useLang } from "./LangContext";

type Theme = "light" | "dark";

const STORAGE_KEY = "hotai-theme";
const THEME_COLOR = { light: "#ffd60a", dark: "#090b12" } as const;

function readTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Storage can be disabled in private browsing or embedded contexts.
  }
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

function setThemeColor(theme: Theme) {
  const color = THEME_COLOR[theme];
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  if (metas.length === 0) {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    meta.setAttribute("content", color);
    document.head.appendChild(meta);
    return;
  }
  metas.forEach((m) => {
    m.setAttribute("content", color);
    m.removeAttribute("media");
  });
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.setAttribute("data-theme", theme);
  root.style.colorScheme = theme;
  setThemeColor(theme);
}

export function ThemeToggle() {
  const { lang } = useLang();
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const initial = readTheme();
    setTheme(initial);
    applyTheme(initial);
    setMounted(true);
  }, []);

  const next = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => {
        setTheme(next);
        applyTheme(next);
        try {
          window.localStorage.setItem(STORAGE_KEY, next);
        } catch {
          // Keep the current session usable when persistent storage is unavailable.
        }
      }}
      className="kz-btn kz-btn-icon"
      aria-label={next === "dark" ? (lang === "zh" ? "切换深色模式" : "Switch to dark mode") : (lang === "zh" ? "切换浅色模式" : "Switch to light mode")}
      title={next === "dark" ? (lang === "zh" ? "深色" : "Dark") : (lang === "zh" ? "浅色" : "Light")}
    >
      {mounted && theme === "dark" ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
        </svg>
      )}
    </button>
  );
}

/** Renders an inline script that sets theme class + data-theme + theme-color before paint. */
export function ThemeNoFlashScript() {
  const src = `
    (function() {
      try {
        var k = '${STORAGE_KEY}';
        var s = localStorage.getItem(k);
        var d = s ? s === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
        var t = d ? 'dark' : 'light';
        var root = document.documentElement;
        root.classList.toggle('dark', d);
        root.setAttribute('data-theme', t);
        root.style.colorScheme = t;
        var color = d ? '${THEME_COLOR.dark}' : '${THEME_COLOR.light}';
        var metas = document.querySelectorAll('meta[name="theme-color"]');
        if (metas.length === 0) {
          var m = document.createElement('meta');
          m.setAttribute('name', 'theme-color');
          m.setAttribute('content', color);
          document.head.appendChild(m);
        } else {
          metas.forEach(function(el) {
            el.setAttribute('content', color);
            el.removeAttribute('media');
          });
        }
      } catch (_) {}
    })();
  `;
  return <script dangerouslySetInnerHTML={{ __html: src }} />;
}
