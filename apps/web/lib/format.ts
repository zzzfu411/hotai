// Older stories show a calendar date. Pin the zone so server and browser render
// the same text (otherwise hydration diverges across time zones).
const SHORT_DATE = {
  zh: new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", timeZone: "Asia/Shanghai" }),
  en: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
} as const;

export function timeAgo(date: Date, lang: "en" | "zh" = "en", now = Date.now()): string {
  const diff = now - date.getTime();
  const mins = Math.floor(diff / 60_000);
  if (lang === "zh") {
    if (mins < 1) return "刚刚";
    if (mins < 60) return `${mins} 分钟前`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} 小时前`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days} 天前`;
    return SHORT_DATE.zh.format(date);
  }
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return SHORT_DATE.en.format(date);
}

export function formatScore(n: number): string {
  if (n < 10) return n.toFixed(1);
  return String(Math.round(n));
}

/**
 * Source names for list rows: drop a trailing qualifier such as
 * "Hacker News (AI filter)" → "Hacker News". The full name stays available
 * as a tooltip and on the source page.
 */
export function shortSourceName(name: string): string {
  const short = name.replace(/\s*[(（][^()（）]{1,24}[)）]\s*$/u, "").trim();
  return short || name;
}

export function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const STAMP = {
  zh: new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }),
  en: new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }),
} as const;

/**
 * Publication time on a story page, in the reader's site clock: Beijing time
 * for Chinese (`2026年10月15日 09:45`), UTC for English (`15 Oct 2026, 01:45 UTC`).
 */
export function formatStamp(date: Date, lang: "zh" | "en"): string {
  return lang === "zh" ? STAMP.zh.format(date) : `${STAMP.en.format(date)} UTC`;
}
