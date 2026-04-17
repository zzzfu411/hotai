import Parser from "rss-parser";
import type { Source } from "@hotai/db";
import type { RawItem } from "../types.js";
import { config } from "../config.js";

const parser = new Parser({
  timeout: config.fetchTimeoutMs,
  headers: { "User-Agent": config.userAgent, Accept: "application/rss+xml, application/xml, text/xml, */*" },
});

const HN_POINTS_RE = /Points:\s*(\d+)/i;
const HN_COMMENTS_RE = /Comments:\s*(\d+)/i;

export async function fetchRss(source: Source): Promise<RawItem[]> {
  const feed = await parser.parseURL(source.url);
  const items: RawItem[] = [];
  for (const it of feed.items ?? []) {
    const link = it.link ?? it.guid;
    if (!link || !it.title) continue;
    const publishedAt = it.isoDate
      ? new Date(it.isoDate)
      : it.pubDate
        ? new Date(it.pubDate)
        : new Date();
    const contentText = stripHtml(it.contentSnippet ?? it.content ?? "");
    const signals = extractSignals(source.slug, it);
    items.push({
      url: link,
      title: it.title.trim(),
      summary: truncate(contentText, 400),
      author: it.creator ?? (it as any).author ?? null,
      publishedAt,
      tags: extractTags(it),
      signals,
      raw: { categories: it.categories, guid: it.guid },
    });
  }
  return items.slice(0, config.perSourceLimit);
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
    .map((s) => String(s).trim().toLowerCase())
    .slice(0, 6);
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function truncate(s: string, n: number): string | undefined {
  if (!s) return undefined;
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
