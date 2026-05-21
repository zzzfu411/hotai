import type { Source } from "@hotai/db";
import type { RawItem } from "./types.js";
import { fetchRss } from "./sources/rss.js";
import { fetchGithubTrending } from "./sources/github-trending.js";
import {
  fetchHuggingFaceTrending,
  fetchHuggingFacePapers,
} from "./sources/huggingface.js";
import { scrapeChineseList } from "./sources/chinese-media.js";

type Fetcher = (source: Source) => Promise<RawItem[]>;

const BY_SLUG: Record<string, Fetcher> = {
  "github-trending": fetchGithubTrending,
  "huggingface-trending": fetchHuggingFaceTrending,
  "huggingface-papers": fetchHuggingFacePapers,
};

const BY_TYPE: Record<string, Fetcher> = {
  rss: fetchRss,
  scrape: scrapeChineseList,
};

export async function fetchSource(source: Source): Promise<RawItem[]> {
  const bySlug = BY_SLUG[source.slug];
  if (bySlug) return bySlug(source);
  const byType = BY_TYPE[source.type];
  if (byType) return byType(source);
  return [];
}
