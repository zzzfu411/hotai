import { beforeEach, describe, expect, it } from "vitest";
import { catalogHealth } from "./catalog-health";
import { CATALOG_SOURCES } from "./catalog";
import { putFeedCache, resetFeedCache } from "./feed-cache";
describe("live RSS observability", () => {
  beforeEach(resetFeedCache);
  it("distinguishes cold, failed, and stale sources", () => {
    const now = Date.now();
    expect(catalogHealth(now).status).toBe("unknown");
    const entry = { at: now, ttl: 1000, etag: null, lastModified: null, contentType: "text/xml", finalUrl: "https://example.com", feed: null, fail: true };
    putFeedCache(CATALOG_SOURCES[0]!.url, entry);
    expect(catalogHealth(now)).toMatchObject({ status: "unavailable", failed: 1 });
    putFeedCache(CATALOG_SOURCES[0]!.url, { ...entry, fail: false, staleSince: now - 1000, feed: { title: "Feed", items: [] } });
    expect(catalogHealth(now)).toMatchObject({ status: "degraded", stale: 1, fresh: 0 });
  });
});
