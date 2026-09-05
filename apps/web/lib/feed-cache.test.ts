import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  FEED_CACHE_FAIL_TTL_MS,
  FEED_CACHE_STALE_MS,
  FEED_CACHE_TTL_MS,
  isFreshFeedCache,
  loadRemoteFeed,
  peekFeedCache,
  putFeedCache,
  resetFeedCache,
  readableFeedSnapshot,
} from "./feed-cache";
import type { PublicFetchInit, PublicFetchResult } from "./ssrf";

const RSS = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Lab</title>
    <item>
      <title>Paper</title>
      <link>https://ex.com/p</link>
      <pubDate>Sat, 23 Aug 2026 12:00:00 GMT</pubDate>
      <description>An abstract.</description>
    </item>
  </channel>
</rss>`;

function okFetch(etag = '"v1"'): PublicFetchResult {
  return {
    url: new URL("https://ex.com/rss"),
    status: 200,
    contentType: "application/rss+xml",
    body: RSS,
    etag,
    lastModified: "Sat, 23 Aug 2026 12:00:00 GMT",
  };
}

describe("feed-cache", () => {
  beforeEach(() => resetFeedCache());

  it("serves only a bounded cached snapshot during a dependency outage", async () => {
    expect(readableFeedSnapshot("https://ex.com/rss")).toBeNull();
    await loadRemoteFeed("https://ex.com/rss", { fetch: async () => okFetch() });
    const at = peekFeedCache("https://ex.com/rss")!.at;
    expect(readableFeedSnapshot("https://ex.com/rss", at + 1)?.stale).toBe(false);
    expect(readableFeedSnapshot("https://ex.com/rss", at + FEED_CACHE_TTL_MS + 1)?.stale).toBe(true);
    expect(readableFeedSnapshot("https://ex.com/rss", at + FEED_CACHE_STALE_MS)).toBeNull();
  });

  it("reports a fresh hit via isFreshFeedCache", async () => {
    expect(isFreshFeedCache("https://ex.com/rss")).toBe(false);
    await loadRemoteFeed("https://ex.com/rss", { fetch: async () => okFetch() });
    expect(isFreshFeedCache("https://ex.com/rss")).toBe(true);
  });

  it("parses once and serves a fresh hit without refetching", async () => {
    let calls = 0;
    const fetch = async () => {
      calls += 1;
      return okFetch();
    };
    const a = await loadRemoteFeed("https://ex.com/rss", { fetch });
    const b = await loadRemoteFeed("https://ex.com/rss", { fetch });
    expect(a?.title).toBe("Lab");
    expect(a?.items).toHaveLength(1);
    expect(b?.items[0]?.title).toBe("Paper");
    expect(calls).toBe(1);
  });

  it("coalesces concurrent misses into one upstream GET", async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetch = async () => {
      calls += 1;
      await gate;
      return okFetch();
    };
    const p1 = loadRemoteFeed("https://ex.com/rss", { fetch });
    const p2 = loadRemoteFeed("https://ex.com/rss", { fetch });
    release();
    const [a, b] = await Promise.all([p1, p2]);
    expect(calls).toBe(1);
    expect(a?.items[0]?.url).toBe(b?.items[0]?.url);
  });

  it("revalidates with If-None-Match and keeps the body on 304", async () => {
    const fetch1 = async () => okFetch('"v1"');
    await loadRemoteFeed("https://ex.com/rss", { fetch: fetch1 });
    const stored = peekFeedCache("https://ex.com/rss");
    expect(stored).toBeTruthy();
    putFeedCache("https://ex.com/rss", { ...stored!, at: Date.now() - FEED_CACHE_TTL_MS - 1 });

    let seenEtag: string | undefined;
    const fetch2 = async (_url: string, init?: PublicFetchInit) => {
      seenEtag = init?.conditional?.etag ?? undefined;
      return {
        url: new URL("https://ex.com/rss"),
        status: 304,
        contentType: "",
        body: "",
        etag: '"v1"',
        lastModified: null,
      };
    };
    const feed = await loadRemoteFeed("https://ex.com/rss", { fetch: fetch2 });
    expect(seenEtag).toBe('"v1"');
    expect(feed?.title).toBe("Lab");
  });

  it("returns stale feed when the origin fails after expiry", async () => {
    await loadRemoteFeed("https://ex.com/rss", { fetch: async () => okFetch() });
    const stored = peekFeedCache("https://ex.com/rss")!;
    putFeedCache("https://ex.com/rss", { ...stored, at: Date.now() - FEED_CACHE_TTL_MS - 1 });
    const feed = await loadRemoteFeed("https://ex.com/rss", {
      fetch: async () => {
        throw new Error("upstream down");
      },
    });
    expect(feed?.title).toBe("Lab");
  });

  it("cooldowns stale-if-error responses before retrying the origin", async () => {
    await loadRemoteFeed("https://ex.com/rss", { fetch: async () => okFetch() });
    const stored = peekFeedCache("https://ex.com/rss")!;
    putFeedCache("https://ex.com/rss", { ...stored, at: Date.now() - FEED_CACHE_TTL_MS - 1 });
    let calls = 0;
    const fetch = async () => {
      calls += 1;
      throw new Error("upstream down");
    };

    const first = await loadRemoteFeed("https://ex.com/rss", { fetch });
    const second = await loadRemoteFeed("https://ex.com/rss", { fetch });
    const cooled = peekFeedCache("https://ex.com/rss")!;
    expect(first?.title).toBe("Lab");
    expect(second?.title).toBe("Lab");
    expect(calls).toBe(1);
    expect(cooled.ttl).toBe(FEED_CACHE_FAIL_TTL_MS);
    expect(cooled.fail).toBe(false);
  });

  it("does not slide the stale window across repeated origin failures", async () => {
    vi.useFakeTimers();
    try {
      const originAt = new Date("2026-08-01T00:00:00.000Z").getTime();
      vi.setSystemTime(originAt);
      await loadRemoteFeed("https://ex.com/rss", { fetch: async () => okFetch() });

      vi.setSystemTime(originAt + FEED_CACHE_TTL_MS + 1);
      let calls = 0;
      const fetch = async () => {
        calls += 1;
        throw new Error("upstream down");
      };
      expect((await loadRemoteFeed("https://ex.com/rss", { fetch }))?.title).toBe("Lab");
      expect(peekFeedCache("https://ex.com/rss")?.staleSince).toBe(originAt);

      vi.setSystemTime(originAt + FEED_CACHE_STALE_MS + 1);
      await expect(loadRemoteFeed("https://ex.com/rss", { fetch })).rejects.toThrow("upstream down");
      expect(calls).toBe(2);
      expect(peekFeedCache("https://ex.com/rss")?.fail).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("caches a failed fetch so the next pull does not wait on the origin", async () => {
    let calls = 0;
    const fetch = async () => {
      calls += 1;
      throw new Error("timeout");
    };
    await expect(loadRemoteFeed("https://dead.example/rss", { fetch })).rejects.toThrow("timeout");
    await expect(loadRemoteFeed("https://dead.example/rss", { fetch })).rejects.toThrow("cached fetch failed");
    expect(calls).toBe(1);
    expect(FEED_CACHE_FAIL_TTL_MS).toBeGreaterThan(0);
  });
});
