import Parser from "rss-parser";
import { fetchPublic } from "./ssrf";
import { safeHttpUrl } from "./safe-url";
import { sanitizeRemoteHtml } from "./sanitize-remote-html";
import { shapeJuyaHtml, type JuyaTocItem, type JuyaVideo } from "./juya-shape";

/** Live Juya briefing. Official GitHub Pages RSS is gone; daily.juya.uk is current. */
export const JUYA_HOME = "https://daily.juya.uk/";
export const JUYA_RSS = "https://daily.juya.uk/rss.xml";
export const JUYA_VIDEO_BILI = "https://space.bilibili.com/285286947";
export const JUYA_VIDEO_YT = "https://www.youtube.com/@imjuya";

export type { JuyaTocItem, JuyaVideo } from "./juya-shape";

export type JuyaIssue = {
  date: string;
  title: string;
  url: string;
  html: string;
  excerpt: string;
  cover: string | null;
  publishedAt: string | null;
  toc: JuyaTocItem[];
  videos: JuyaVideo[];
  /** Numbered stories; 0 when the issue kept its original layout. */
  count: number;
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
const RETRY_MS = 60_000;

type CacheBox = { at: number; issues: JuyaIssue[] };
const g = globalThis as typeof globalThis & {
  __hotai_juya?: CacheBox;
  __hotai_juya_inflight?: Promise<JuyaIssue[]>;
};

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function sanitizeJuyaHtml(raw: string): string {
  return sanitizeRemoteHtml(raw, JUYA_HOME);
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
    const { html, heading, toc, cover, videos, count } = shapeJuyaHtml(clean);
    const excerpt = stripTags(it.contentSnippet || html).slice(0, 220);
    // RSS publishers occasionally emit an invalid pubDate. Calling
    // toISOString() on that Invalid Date would abort the whole feed parse;
    // discard the bad value and let the issue date provide a stable fallback.
    const published = toIso(it.isoDate) ?? toIso(it.pubDate);
    const issueUrl = safeHttpUrl(it.link, JUYA_HOME) ?? `${JUYA_HOME}issues/${date}/`;
    out.push({
      date,
      title: heading || title || `AI 早报 ${date}`,
      url: issueUrl,
      html,
      excerpt,
      cover,
      publishedAt: published && !Number.isNaN(Date.parse(published)) ? published : `${date}T00:00:00.000Z`,
      toc,
      videos,
      count,
    });
  }
  out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return out;
}

function toIso(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
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

function refreshJuyaIssues(previous: CacheBox | undefined): Promise<JuyaIssue[]> {
  if (g.__hotai_juya_inflight) return g.__hotai_juya_inflight;
  const job = (async () => {
    try {
      const issues = await fetchJuyaIssues();
      g.__hotai_juya = { at: Date.now(), issues };
      return issues;
    } catch (err) {
      if (previous?.issues.length) {
        // Keep the old copy and try the feed again after RETRY_MS.
        g.__hotai_juya = { at: Date.now() - CACHE_MS + RETRY_MS, issues: previous.issues };
        return previous.issues;
      }
      throw err;
    } finally {
      g.__hotai_juya_inflight = undefined;
    }
  })();
  g.__hotai_juya_inflight = job;
  return job;
}

/**
 * Issues from the Juya feed, cached in memory. Once a copy exists, an expired
 * cache answers at once and refreshes in the background, so no reader waits
 * on the feed after the first load (which `instrumentation.ts` starts at boot).
 */
export async function loadJuyaIssues(): Promise<JuyaIssue[]> {
  const hit = g.__hotai_juya;
  if (hit?.issues.length) {
    if (Date.now() - hit.at >= CACHE_MS) void refreshJuyaIssues(hit).catch(() => {});
    return hit.issues;
  }
  if (hit && Date.now() - hit.at < RETRY_MS) return hit.issues;
  return refreshJuyaIssues(hit);
}

export function pickJuyaIssue(issues: JuyaIssue[], date?: string | null): JuyaIssue | null {
  if (!issues.length) return null;
  if (date && DATE_RE.test(date)) {
    return issues.find((x) => x.date === date) ?? issues[0]!;
  }
  return issues[0]!;
}
