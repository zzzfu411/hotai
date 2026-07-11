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

/**
 * Slug-specific integrations win over the generic per-type fetchers.
 * An unmatched source is a config error — throw so it counts against the
 * source's health instead of silently producing zero items forever.
 */
export async function fetchSource(source: Source): Promise<RawItem[]> {
  const fetcher = BY_SLUG[source.slug] ?? BY_TYPE[source.type];
  if (!fetcher) {
    throw new Error(`no fetcher wired for source "${source.slug}" (type=${source.type})`);
  }
  return fetcher(source);
}
