import Parser from "rss-parser";
import DOMPurify from "isomorphic-dompurify";
import { fetchPublic } from "./ssrf";

/** Live Juya briefing. Official GitHub Pages RSS is gone; daily.juya.uk is current. */
export const JUYA_HOME = "https://daily.juya.uk/";
export const JUYA_RSS = "https://daily.juya.uk/rss.xml";
export const JUYA_VIDEO_BILI = "https://space.bilibili.com/285286947";
export const JUYA_VIDEO_YT = "https://www.youtube.com/@imjuya";

export type JuyaTocItem = { id: string; text: string; level: 2 | 3 };

export type JuyaIssue = {
  date: string;
  title: string;
  url: string;
  html: string;
  excerpt: string;
  cover: string | null;
  publishedAt: string | null;
  toc: JuyaTocItem[];
};

const parser = new Parser({
  timeout: 20_000,
  customFields: {
    item: [
      ["content:encoded", "contentEncoded"],
      ["media:content", "mediaContent", { keepArray: true }],
    ],
  },
});

const DATE_RE = /(\d{4}-\d{2}-\d{2})/;
const CACHE_MS = 15 * 60 * 1000;

type CacheBox = { at: number; issues: JuyaIssue[] };
const g = globalThis as typeof globalThis & {
  __hotai_juya?: CacheBox;
  __hotai_juya_inflight?: Promise<JuyaIssue[]>;
};

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function firstImg(html: string): string | null {
  const m = html.match(/<img\b[^>]*\bsrc=["'](https?:\/\/[^"']+)["']/i);
  return m?.[1] ?? null;
}

function slugHead(text: string, i: number): string {
  const slug = text
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug ? `juya-${slug}` : `juya-h-${i}`;
}

function decorateHeadings(html: string): { html: string; toc: JuyaTocItem[] } {
  const toc: JuyaTocItem[] = [];
  let i = 0;
  const next = html.replace(/<h([23])(\b[^>]*)>([\s\S]*?)<\/h\1>/gi, (_all, level, attrs, inner) => {
    i += 1;
    const text = stripTags(String(inner));
    const existing = /\bid=["']([^"']+)["']/i.exec(String(attrs));
    const id = existing?.[1] || slugHead(text, i);
    const lv = Number(level) === 3 ? 3 : 2;
    if (text) toc.push({ id, text, level: lv });
    const cleaned = String(attrs).replace(/\s*id=["'][^"']*["']/gi, "");
    return `<h${level} id="${id}"${cleaned}>${inner}</h${level}>`;
  });
  return { html: next, toc };
}

export function sanitizeJuyaHtml(raw: string): string {
  return DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "link", "meta", "base"],
    ADD_ATTR: ["target", "rel"],
  }).trim();
}

export function issuesFromParsed(
  items: Array<{
    title?: string;
    link?: string;
    isoDate?: string;
    pubDate?: string;
    content?: string;
    contentSnippet?: string;
    contentEncoded?: string;
  }>,
): JuyaIssue[] {
  const out: JuyaIssue[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const title = (it.title || "").trim();
    const date = DATE_RE.exec(title)?.[1] || DATE_RE.exec(it.link || "")?.[1] || "";
    if (!date || seen.has(date)) continue;
    seen.add(date);
    const rawHtml = (it.contentEncoded || it.content || "").trim();
    if (!rawHtml) continue;
    const clean = sanitizeJuyaHtml(rawHtml);
    if (!clean) continue;
    const { html, toc } = decorateHeadings(clean);
    const excerpt = stripTags(it.contentSnippet || html).slice(0, 220);
    const published = it.isoDate || (it.pubDate ? new Date(it.pubDate).toISOString() : null);
    out.push({
      date,
      title: title || `橘鸦 AI 早报 ${date}`,
      url: it.link || `${JUYA_HOME}issues/${date}/`,
      html,
      excerpt,
      cover: firstImg(html),
      publishedAt: published && !Number.isNaN(Date.parse(published)) ? published : `${date}T00:00:00.000Z`,
      toc,
    });
  }
  out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return out;
}

async function fetchJuyaIssues(): Promise<JuyaIssue[]> {
  const fetched = await fetchPublic(JUYA_RSS, {
    timeoutMs: 20_000,
    maxBytes: 2_000_000,
    accept: "application/rss+xml, application/xml, text/xml, */*",
  });
  const feed = await parser.parseString(fetched.body);
  return issuesFromParsed(
    (feed.items ?? []) as Array<{
      title?: string;
      link?: string;
      isoDate?: string;
      pubDate?: string;
      content?: string;
      contentSnippet?: string;
      contentEncoded?: string;
    }>,
  );
}

export async function loadJuyaIssues(): Promise<JuyaIssue[]> {
  const hit = g.__hotai_juya;
  const ttl = hit && hit.issues.length ? CACHE_MS : 60_000;
  if (hit && Date.now() - hit.at < ttl) return hit.issues;
  if (g.__hotai_juya_inflight) return g.__hotai_juya_inflight;

  const job = (async () => {
    try {
      const issues = await fetchJuyaIssues();
      g.__hotai_juya = { at: Date.now(), issues };
      return issues;
    } catch (err) {
      if (hit?.issues.length) return hit.issues;
      throw err;
    } finally {
      g.__hotai_juya_inflight = undefined;
    }
  })();

  g.__hotai_juya_inflight = job;
  return job;
}

export function pickJuyaIssue(issues: JuyaIssue[], date?: string | null): JuyaIssue | null {
  if (!issues.length) return null;
  if (date && DATE_RE.test(date)) {
    return issues.find((x) => x.date === date) ?? issues[0]!;
  }
  return issues[0]!;
}
