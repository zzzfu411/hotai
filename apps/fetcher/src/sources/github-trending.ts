import * as cheerio from "cheerio";
import type { Source } from "@hotai/db";
import type { RawItem } from "../types.js";
import { httpText } from "../http.js";

const AI_KEYWORDS = [
  "ai", "ml", "llm", "gpt", "claude", "gemini", "llama", "mistral",
  "deepseek", "qwen", "transformer", "diffusion", "neural", "agent",
  "huggingface", "openai", "anthropic", "pytorch", "tensorflow",
];

function looksLikeAi(text: string): boolean {
  const t = text.toLowerCase();
  return AI_KEYWORDS.some((k) => t.includes(k));
}

export async function fetchGithubTrending(source: Source): Promise<RawItem[]> {
  const html = await httpText(source.url);
  const $ = cheerio.load(html);
  const items: RawItem[] = [];
  $("article.Box-row").each((_, el) => {
    const $el = $(el);
    const repoPath = $el.find("h2 a").attr("href")?.trim();
    if (!repoPath) return;
    const title = repoPath.replace(/^\//, "");
    const desc = $el.find("p").text().trim();
    if (!looksLikeAi(`${title} ${desc}`)) return;
    const starsToday = Number(
      $el.find("span.d-inline-block.float-sm-right").text().replace(/[^\d]/g, "") || 0,
    );
    items.push({
      url: `https://github.com${repoPath}`,
      title,
      summary: desc || null,
      publishedAt: new Date(),
      tags: ["github", "trending"],
      signals: { stars: starsToday },
      raw: { starsToday },
    });
  });
  return items;
}
