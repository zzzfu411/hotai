import * as cheerio from "cheerio";
import type { Source } from "@hotai/db";
import type { RawItem } from "../types.js";
import { config } from "../config.js";
import { httpText } from "../http.js";

/**
 * 中文媒体抓取:对不提供 RSS 的站点做兜底,启发式选择器按 slug 分发。
 * 错误不再吞掉 —— 让它抛给 cycle 层计入源健康(连续失败会自动停用),
 * 否则站点改版后源会静默消失。
 */

type ListScraper = ($: cheerio.CheerioAPI) => RawItem[];

const SCRAPERS: Record<string, ListScraper> = {
  "36kr-ai": ($) =>
    collectLinks($, "a.article-item-title, .article-item-title a, a[href*='/p/']", "https://36kr.com", ["36kr"]),
  "infoq-cn-ai": ($) =>
    collectLinks($, "a[href*='/article/'], a[href*='/news/']", "https://www.infoq.cn", ["infoq"]),
};

export async function scrapeChineseList(source: Source): Promise<RawItem[]> {
  const scraper = SCRAPERS[source.slug];
  if (!scraper) {
    throw new Error(`no scraper defined for scrape source "${source.slug}"`);
  }
  const html = await httpText(source.url);
  return dedupeInPage(scraper(cheerio.load(html)));
}

function collectLinks(
  $: cheerio.CheerioAPI,
  selector: string,
  origin: string,
  tags: string[],
): RawItem[] {
  const items: RawItem[] = [];
  $(selector).each((_, el) => {
    const $a = $(el);
    const href = $a.attr("href");
    const title = $a.text().trim();
    if (!href || !title || title.length < 6) return;
    const url = href.startsWith("http") ? href : `${origin}${href}`;
    items.push({
      url,
      title,
      publishedAt: new Date(),
      tags,
    });
  });
  return items;
}

function dedupeInPage(items: RawItem[]): RawItem[] {
  const seen = new Set<string>();
  const out: RawItem[] = [];
  for (const it of items) {
    if (seen.has(it.url)) continue;
    seen.add(it.url);
    out.push(it);
    if (out.length >= config.perSourceLimit) break;
  }
  return out;
}
