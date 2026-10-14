import {
  CATALOG_ITEMS_PER_SOURCE,
  CATALOG_SUMMARY_LEN,
  DEFAULT_ENABLED_IDS,
  idsForCategory,
  resolveCatalogSources,
  type CatalogCategoryId,
} from "./catalog";
import { loadRemoteFeed, readableFeedSnapshot } from "./feed-cache";
import { NOOK_PAGE_SIZE } from "./nook-history";
import {
  EDITORIAL_ANCHOR_IDS,
  editorialSettleSourceCount,
  isEditorialLane,
  mergeSources,
  type PullSource,
  type TimelineItem,
} from "./nook-merge";
import type { RemoteFeedItem } from "./parse-remote-feed";

/** Per-source cap and summary trim shared by /api/catalog/pull and the first screen. */
export function slimCatalogItems(items: RemoteFeedItem[]): RemoteFeedItem[] {
  return items.slice(0, CATALOG_ITEMS_PER_SOURCE).map((it) => ({
    ...it,
    summary:
      it.summary.length <= CATALOG_SUMMARY_LEN
        ? it.summary
        : `${it.summary.slice(0, CATALOG_SUMMARY_LEN - 1)}…`,
  }));
}

/**
 * One page of stories, with summaries cut to what two clamped lines show.
 * The browser pulls the full timeline right after, so the HTML stays small.
 */
export const INITIAL_NOOK_ITEMS = NOOK_PAGE_SIZE;
export const INITIAL_SUMMARY_LEN = 120;

function trimSummary(summary: string): string {
  return summary.length <= INITIAL_SUMMARY_LEN ? summary : `${summary.slice(0, INITIAL_SUMMARY_LEN - 1)}…`;
}

export type InitialNook = {
  category: CatalogCategoryId;
  /** Source ids the snapshot was built for (the default set for this lane). */
  ids: string[];
  items: TimelineItem[];
  okCount: number;
  staleCount: number;
  fetchedAt: string | null;
};

type SnapshotOptions = {
  read?: typeof readableFeedSnapshot;
  /** Starts a background refresh of a cached feed past its TTL. */
  warm?: (url: string) => void;
};

function warmInBackground(url: string): void {
  // Coalesced in feed-cache, so the browser's pull a moment later joins this
  // request instead of starting its own.
  void loadRemoteFeed(url).catch(() => {});
}

/**
 * The first screen of the live timeline, built only from feeds the server
 * already holds in memory: no network wait, no database, nothing written to
 * Article. Returns null when too few sources are cached for a stable order;
 * the browser then streams the timeline as before.
 */
export function initialNookSnapshot(
  category: CatalogCategoryId,
  opts: SnapshotOptions = {},
): InitialNook | null {
  const read = opts.read ?? readableFeedSnapshot;
  const warm = opts.warm ?? warmInBackground;
  const sources = resolveCatalogSources(idsForCategory(category, [...DEFAULT_ENABLED_IDS]));
  const ids = sources.map((src) => src.id);
  const received: PullSource[] = [];
  for (const src of sources) {
    // The internal Hot AI feed reads the database; leave it to the browser pull.
    if (src.url.startsWith("/")) continue;
    const hit = read(src.url);
    // Feeds never fetched stay with the browser pull, which is rate limited;
    // a page render only refreshes what an earlier pull already cached.
    if (!hit) continue;
    if (hit.stale) warm(src.url);
    received.push({
      id: src.id,
      name: src.name,
      ok: true,
      items: slimCatalogItems(hit.feed.items),
      stale: hit.stale,
      fetchedAt: hit.fetchedAt,
    });
  }
  if (received.length === 0) return null;

  // Same settle rule as the streamed editorial lanes: an order built from a
  // handful of sources would be reshuffled as soon as the rest arrive.
  if (isEditorialLane(category)) {
    const anchored = received.some((src) => EDITORIAL_ANCHOR_IDS.includes(src.id));
    if (!anchored || received.length < editorialSettleSourceCount(ids.length)) return null;
  }

  const merged = mergeSources(received, category, received.length === ids.length);
  if (merged.items.length === 0) return null;
  return {
    category,
    ids,
    items: merged.items
      .slice(0, INITIAL_NOOK_ITEMS)
      .map((item) => ({ ...item, summary: trimSummary(item.summary) })),
    // Cache entries past their TTL are still at most FEED_CACHE_STALE_MS old
    // and are refreshed by the pull that follows; a "cached copy" notice here
    // would only appear and vanish again, moving the list under it.
    okCount: merged.okCount + merged.staleCount,
    staleCount: 0,
    fetchedAt: merged.fetchedAt,
  };
}
