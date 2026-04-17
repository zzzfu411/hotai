import * as cheerio from "cheerio";
import type { Source } from "@hotai/db";
import type { RawItem } from "../types.js";
import { httpText } from "../http.js";

/**
 * 中文媒体抓取:对不提供 RSS 的站点做兜底。
 * 用启发式选择器找列表项,尽量稳健,失败时静默返回空数组。
 */
export async function scrapeChineseList(source: Source): Promise<RawItem[]> {
  try {
    const html = await httpText(source.url);
    const $ = cheerio.load(html);
    const items: RawItem[] = [];

    if (source.slug === "36kr-ai") {
      $("a.article-item-title, .article-item-title a, a[href*='/p/']").each((_, el) => {
        const $a = $(el);
        const href = $a.attr("href");
        const title = $a.text().trim();
        if (!href || !title || title.length < 6) return;
        const url = href.startsWith("http") ? href : `https://36kr.com${href}`;
        items.push({
          url,
          title,
          publishedAt: new Date(),
          tags: ["36kr"],
        });
      });
      return dedupeInPage(items);
    }

    if (source.slug === "infoq-cn-ai") {
      $("a[href*='/article/'], a[href*='/news/']").each((_, el) => {
        const $a = $(el);
        const href = $a.attr("href");
        const title = $a.text().trim();
        if (!href || !title || title.length < 6) return;
        const url = href.startsWith("http") ? href : `https://www.infoq.cn${href}`;
        items.push({
          url,
          title,
          publishedAt: new Date(),
          tags: ["infoq"],
        });
      });
      return dedupeInPage(items);
    }

    return items;
  } catch (err) {
    console.warn(`  [scrape] ${source.slug} failed:`, (err as Error).message);
    return [];
  }
}

function dedupeInPage(items: RawItem[]): RawItem[] {
  const seen = new Set<string>();
  const out: RawItem[] = [];
  for (const it of items) {
    if (seen.has(it.url)) continue;
    seen.add(it.url);
    out.push(it);
    if (out.length >= 30) break;
  }
  return out;
}
