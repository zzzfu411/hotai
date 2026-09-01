import Parser from "rss-parser";
import type { Source } from "@hotai/db";
import type { RawItem } from "../types.js";
import { config } from "../config.js";
import { httpText } from "../http.js";

const parser = new Parser({
  timeout: config.fetchTimeoutMs,
  customFields: {
    item: [["content:encoded", "contentEncoded"]],
  },
});

const HN_POINTS_RE = /Points:\s*(\d+)/i;
const HN_COMMENTS_RE = /Comments:\s*(\d+)/i;
export const MAX_RSS_TITLE_LEN = 300;
export const MAX_RSS_AUTHOR_LEN = 200;
export const MAX_RSS_SUMMARY_LEN = 600;
export const MAX_RSS_TAG_LEN = 80;

export async function fetchRss(source: Source): Promise<RawItem[]> {
  const xml = await httpText(source.url, {
    headers: { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
  });
  const feed = await parser.parseString(xml);
  const items: RawItem[] = [];
  for (const it of feed.items ?? []) {
    const link = it.link ?? it.guid;
    if (!link || !it.title) continue;
    const publishedAt = it.isoDate
      ? new Date(it.isoDate)
      : it.pubDate
        ? new Date(it.pubDate)
        : new Date();
    const contentText = selectSummary(it as unknown as Record<string, unknown>);
    const signals = extractSignals(source.slug, it);
    items.push({
      url: link,
      title: truncate(it.title.trim(), MAX_RSS_TITLE_LEN) ?? "Untitled",
      summary: contentText,
      author: cleanAuthor(it.creator ?? (it as any).author),
      publishedAt,
      tags: extractTags(it),
      signals,
      raw: { categories: it.categories, guid: it.guid },
    });
  }
  return items.slice(0, config.perSourceLimit);
}

/** Prefer a clean snippet, then full content including RSS content:encoded. */
export function selectSummary(
  item: { contentSnippet?: unknown; contentEncoded?: unknown; content?: unknown },
  maxLength = 400,
): string | undefined {
  const limit = Math.max(1, Math.min(maxLength, MAX_RSS_SUMMARY_LEN));
  const candidates = [item.contentSnippet, item.contentEncoded, item.content];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const text = stripHtml(candidate);
    if (text) return truncate(text, limit);
  }
  return undefined;
}

function extractSignals(slug: string, it: Parser.Item): { points?: number; comments?: number } | undefined {
  const body = `${it.content ?? ""} ${it.contentSnippet ?? ""}`;
  if (slug.startsWith("hn-")) {
    const p = body.match(HN_POINTS_RE)?.[1];
    const c = body.match(HN_COMMENTS_RE)?.[1];
    const out: { points?: number; comments?: number } = {};
    if (p) out.points = Number(p);
    if (c) out.comments = Number(c);
    return out;
  }
  return undefined;
}

function extractTags(it: Parser.Item): string[] {
  const cats = (it.categories as unknown as (string | { _: string })[] | undefined) ?? [];
  return cats
    .map((c) => (typeof c === "string" ? c : c?._ ?? ""))
    .filter(Boolean)
    .map((s) => String(s).trim().toLowerCase().slice(0, MAX_RSS_TAG_LEN))
    .slice(0, 6);
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function truncate(s: string, n: number): string | undefined {
  if (!s) return undefined;
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

function cleanAuthor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? truncate(text, MAX_RSS_AUTHOR_LEN) ?? null : null;
}
