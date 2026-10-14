import { describe, expect, it } from "vitest";
import { CATALOG_BY_ID, CATALOG_ITEMS_PER_SOURCE, CATALOG_SUMMARY_LEN, DEFAULT_ENABLED_IDS, idsForCategory } from "./catalog";
import { INITIAL_NOOK_ITEMS, INITIAL_SUMMARY_LEN, initialNookSnapshot, slimCatalogItems } from "./catalog-snapshot";
import type { readableFeedSnapshot } from "./feed-cache";
import type { RemoteFeedItem } from "./parse-remote-feed";

type Snapshot = NonNullable<ReturnType<typeof readableFeedSnapshot>>;

const NOW = Date.parse("2026-10-14T08:00:00Z");

function feedItems(sourceId: string, count: number, summary = "summary"): RemoteFeedItem[] {
  return Array.from({ length: count }, (_, i) => ({
    title: `${sourceId} story ${i}`,
    url: `https://example.com/${sourceId}/${i}`,
    summary,
    publishedAt: new Date(NOW - (i * 60 + sourceId.length) * 60_000).toISOString(),
    image: null,
  }));
}

function cacheOf(entries: Record<string, { items: RemoteFeedItem[]; stale?: boolean }>) {
  const byUrl = new Map<string, Snapshot>();
  for (const [id, entry] of Object.entries(entries)) {
    const src = CATALOG_BY_ID.get(id);
    if (!src) throw new Error(`unknown source ${id}`);
    byUrl.set(src.url, {
      feed: { title: src.name, items: entry.items },
      fetchedAt: new Date(NOW - 60_000).toISOString(),
      stale: entry.stale ?? false,
    });
  }
  const warmed: string[] = [];
  return {
    read: (url: string) => byUrl.get(url) ?? null,
    warm: (url: string) => void warmed.push(url),
    warmed,
  };
}

describe("initialNookSnapshot", () => {
  it("renders nothing from a cold cache and starts no fetches", () => {
    const cache = cacheOf({});
    expect(initialNookSnapshot("tech", cache)).toBeNull();
    expect(initialNookSnapshot("mix", cache)).toBeNull();
    expect(cache.warmed).toEqual([]);
  });

  it("keeps the editorial lanes on their skeleton until enough sources are cached", () => {
    const fewSources = cacheOf({
      "gnews-top": { items: feedItems("gnews-top", 5) },
      sspai: { items: feedItems("sspai", 5) },
    });
    expect(initialNookSnapshot("mix", fewSources)).toBeNull();

    const noAnchor = cacheOf(Object.fromEntries(
      ["gnews-world", "gnews-tech", "gnews-biz", "sspai", "ithome", "kr36", "ifanr", "solidot", "qbitai"]
        .map((id) => [id, { items: feedItems(id, 5) }]),
    ));
    expect(initialNookSnapshot("mix", noAnchor)).toBeNull();
  });

  it("builds a capped first screen for a topic lane from cached sources", () => {
    const cache = cacheOf({
      "gnews-tech": { items: feedItems("gnews-tech", 30) },
      sspai: { items: feedItems("sspai", 30, "x".repeat(CATALOG_SUMMARY_LEN + 50)), stale: true },
      ithome: { items: feedItems("ithome", 30) },
    });
    const snap = initialNookSnapshot("tech", cache);
    expect(snap).not.toBeNull();
    expect(snap!.category).toBe("tech");
    expect(snap!.ids).toEqual(idsForCategory("tech", [...DEFAULT_ENABLED_IDS]));
    expect(snap!.items).toHaveLength(INITIAL_NOOK_ITEMS);
    // Newest first in topic lanes.
    const times = snap!.items.map((item) => Date.parse(item.publishedAt!));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    // Stale cache entries still count as answering sources, and only they
    // get a background refresh.
    expect(snap!.okCount).toBe(3);
    expect(snap!.staleCount).toBe(0);
    expect(cache.warmed).toEqual([CATALOG_BY_ID.get("sspai")!.url]);
    const sspai = snap!.items.find((item) => item.sourceId === "sspai");
    expect(sspai?.summary.length).toBe(INITIAL_SUMMARY_LEN);
  });

  it("ranks the mix lane once the anchor and enough sources are cached", () => {
    const ids = idsForCategory("mix", [...DEFAULT_ENABLED_IDS]).slice(0, 8);
    expect(ids).toContain("gnews-top");
    const cache = cacheOf(Object.fromEntries(ids.map((id) => [id, { items: feedItems(id, 6) }])));
    const snap = initialNookSnapshot("mix", cache);
    expect(snap).not.toBeNull();
    expect(snap!.items.length).toBeGreaterThan(0);
    expect(snap!.items.length).toBeLessThanOrEqual(INITIAL_NOOK_ITEMS);
    expect(new Set(snap!.items.map((item) => item.sourceId)).size).toBeGreaterThan(1);
  });

  it("caps each source and its summaries for the pull endpoint", () => {
    const slim = slimCatalogItems(feedItems("hn", 40, "y".repeat(CATALOG_SUMMARY_LEN + 10)));
    expect(slim).toHaveLength(CATALOG_ITEMS_PER_SOURCE);
    expect(slim[0]!.summary).toHaveLength(CATALOG_SUMMARY_LEN);
    expect(slim[0]!.summary.endsWith("…")).toBe(true);
  });
});
