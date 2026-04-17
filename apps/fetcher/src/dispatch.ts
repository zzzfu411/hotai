import type { Source } from "@hotai/db";
import type { RawItem } from "./types.js";
import { fetchRss } from "./sources/rss.js";
import { fetchGithubTrending } from "./sources/github-trending.js";
import {
  fetchHuggingFaceTrending,
  fetchHuggingFacePapers,
} from "./sources/huggingface.js";
import { scrapeChineseList } from "./sources/chinese-media.js";

export async function fetchSource(source: Source): Promise<RawItem[]> {
  switch (source.slug) {
    case "github-trending":
      return fetchGithubTrending(source);
    case "huggingface-trending":
      return fetchHuggingFaceTrending(source);
    case "huggingface-papers":
      return fetchHuggingFacePapers(source);
  }
  if (source.type === "rss") return fetchRss(source);
  if (source.type === "scrape") return scrapeChineseList(source);
  return [];
}
