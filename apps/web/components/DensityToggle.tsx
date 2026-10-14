"use client";

import { useSyncExternalStore } from "react";
import { useLang } from "./LangContext";

export type Density = "compact" | "comfortable";

/** Read by ThemeNoFlashScript too, so the layout is right before first paint. */
export const DENSITY_STORAGE_KEY = "hotai-density";
const DENSITY_EVENT = "hotai-density";

function currentDensity(): Density {
  return document.documentElement.dataset.density === "comfortable" ? "comfortable" : "compact";
}

function subscribe(onChange: () => void) {
  window.addEventListener(DENSITY_EVENT, onChange);
  return () => window.removeEventListener(DENSITY_EVENT, onChange);
}

/** Compact is the default; the server always renders it. */
export function useDensity(): Density {
  return useSyncExternalStore(subscribe, currentDensity, () => "compact");
}

function applyDensity(density: Density) {
  const root = document.documentElement;
  if (density === "comfortable") root.dataset.density = "comfortable";
  else delete root.dataset.density;
  try {
    window.localStorage.setItem(DENSITY_STORAGE_KEY, density);
  } catch {
    // Keep the current session usable when persistent storage is unavailable.
  }
  window.dispatchEvent(new Event(DENSITY_EVENT));
}

export function DensityToggle() {
  const { lang } = useLang();
  const zh = lang === "zh";
  const density = useDensity();
  const next: Density = density === "compact" ? "comfortable" : "compact";
  const label = next === "comfortable"
    ? zh ? "切换为舒适排版" : "Switch to comfortable layout"
    : zh ? "切换为紧凑排版" : "Switch to compact layout";

  return (
    <button
      type="button"
      onClick={() => applyDensity(next)}
      className="kz-btn kz-btn-icon"
      aria-label={label}
      title={label}
    >
      {/* CSS shows the icon for html[data-density], which is set before paint. */}
      <svg className="kz-icon-when-compact" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
        <path d="M4 5h16M4 9.7h16M4 14.3h16M4 19h16" />
      </svg>
      <svg className="kz-icon-when-comfortable" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="4" y="4" width="16" height="6.5" rx="1.5" />
        <rect x="4" y="13.5" width="16" height="6.5" rx="1.5" />
      </svg>
    </button>
  );
}
