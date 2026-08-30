import { CATEGORIES } from "./constants";

export type FeedLang = "zh" | "en";

export type FeedQuery = {
  category?: string;
  minImportance?: number;
  lang?: FeedLang;
};

type SummaryRow = {
  summary: string | null;
  aiSummaryEn: string | null;
  aiSummaryZh: string | null;
  aiTopics: string[];
  aiImportance: number | null;
};

export function parseFeedQuery(searchParams: URLSearchParams): FeedQuery {
  const categoryRaw = searchParams.get("category")?.trim().toLowerCase() ?? "";
  const category = CATEGORIES.some((c) => c.slug === categoryRaw) ? categoryRaw : undefined;

  const miRaw = searchParams.get("min_importance");
  let minImportance: number | undefined;
  if (miRaw != null && miRaw !== "") {
    const n = Number(miRaw);
    if (Number.isFinite(n)) minImportance = n;
  }

  const langRaw = searchParams.get("lang")?.trim().toLowerCase();
  const lang: FeedLang | undefined = langRaw === "zh" || langRaw === "en" ? langRaw : undefined;

  return { category, minImportance, lang };
}

/** RSS/JSON description: lang pick, else zh → en → raw summary. */
export function pickFeedSummary(a: SummaryRow, lang?: FeedLang): string {
  if (lang === "en") return a.aiSummaryEn || a.aiSummaryZh || a.summary || "";
  if (lang === "zh") return a.aiSummaryZh || a.aiSummaryEn || a.summary || "";
  return a.aiSummaryZh || a.aiSummaryEn || a.summary || "";
}

export function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Short HTML blurb for JSON Feed `content_html` / RSS `content:encoded`. */
export function feedContentHtml(a: SummaryRow, lang?: FeedLang): string {
  const summary = pickFeedSummary(a, lang);
  const topics = a.aiTopics.filter(Boolean);
  const parts: string[] = [];
  if (summary) parts.push(`<p>${escHtml(summary)}</p>`);
  if (topics.length) parts.push(`<p>主题：${escHtml(topics.join(", "))}</p>`);
  if (a.aiImportance != null && Number.isFinite(a.aiImportance)) {
    parts.push(`<p>重要度：${escHtml(a.aiImportance.toFixed(2))}</p>`);
  }
  return parts.join("");
}

export function feedQueryString(q: FeedQuery): string {
  const sp = new URLSearchParams();
  if (q.category) sp.set("category", q.category);
  if (q.minImportance != null) sp.set("min_importance", String(q.minImportance));
  if (q.lang) sp.set("lang", q.lang);
  const s = sp.toString();
  return s ? `?${s}` : "";
}
