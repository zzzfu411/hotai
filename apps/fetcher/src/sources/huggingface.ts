import type { Source } from "@hotai/db";
import type { RawItem } from "../types.js";
import { httpJson, httpText } from "../http.js";
import * as cheerio from "cheerio";

type HFModel = {
  id: string;
  modelId?: string;
  likes?: number;
  downloads?: number;
  lastModified?: string;
  createdAt?: string;
  pipeline_tag?: string;
  tags?: string[];
};

export async function fetchHuggingFaceTrending(source: Source): Promise<RawItem[]> {
  const models = await httpJson<HFModel[]>(source.url);
  return models.map((m) => {
    const id = m.modelId ?? m.id;
    const published = m.lastModified ?? m.createdAt;
    return {
      url: `https://huggingface.co/${id}`,
      title: id,
      summary: m.pipeline_tag ? `Pipeline: ${m.pipeline_tag}` : null,
      publishedAt: published ? new Date(published) : new Date(),
      tags: m.tags?.slice(0, 5) ?? [],
      signals: { stars: m.likes ?? 0, downloads: m.downloads ?? 0 },
      raw: m,
    };
  });
}

export async function fetchHuggingFacePapers(source: Source): Promise<RawItem[]> {
  const html = await httpText(source.url);
  const $ = cheerio.load(html);
  const items: RawItem[] = [];
  $("article").each((_, el) => {
    const $el = $(el);
    const a = $el.find('a[href^="/papers/"]').first();
    const href = a.attr("href");
    const title = a.text().trim();
    if (!href || !title) return;
    const upvotesText = $el.find("[class*='upvote'], [class*='Upvote']").text().trim();
    const upvotes = Number(upvotesText.match(/\d+/)?.[0] ?? 0);
    items.push({
      url: `https://huggingface.co${href}`,
      title,
      summary: null,
      publishedAt: new Date(),
      tags: ["paper"],
      signals: { points: upvotes },
    });
  });
  return items;
}
