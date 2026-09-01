import { parseRemoteFeed, type RemoteFeed } from "./parse-remote-feed";
import {
  fetchPublic,
  UnsafeUrlError,
  type PublicFetchInit,
  type PublicFetchResult,
} from "./ssrf";

/**
 * Per-URL parsed-feed cache for catalog pull / custom OPML proxy.
 * In-flight requests coalesce so concurrent visitors share one upstream GET.
 * Stale entries are served when the origin is down (stale-if-error).
 */

export const FEED_CACHE_TTL_MS = 8 * 60 * 1000;
export const FEED_CACHE_STALE_MS = 45 * 60 * 1000;
/** Don't re-hammer a dead/blocked origin on every homepage pull. */
export const FEED_CACHE_FAIL_TTL_MS = 2 * 60 * 1000;
const MAX_ENTRIES = 128;

const FEED_ACCEPT =
  "application/feed+json, application/json, application/rss+xml, application/atom+xml, application/xml, text/xml, */*";

export type FeedCacheEntry = {
  at: number;
  ttl: number;
  etag: string | null;
  lastModified: string | null;
  contentType: string;
  feed: RemoteFeed | null;
  finalUrl: string;
  fail: boolean;
};

type CacheBox = {
  entries: Map<string, FeedCacheEntry>;
  inflight: Map<string, Promise<RemoteFeed | null>>;
};

const g = globalThis as typeof globalThis & { __hotai_feed_cache?: CacheBox };

function box(): CacheBox {
  if (!g.__hotai_feed_cache) {
    g.__hotai_feed_cache = { entries: new Map(), inflight: new Map() };
  }
  return g.__hotai_feed_cache;
}

export function peekFeedCache(url: string): FeedCacheEntry | undefined {
  return box().entries.get(url);
}

/** True when a successful parsed feed is still within TTL. */
export function isFreshFeedCache(url: string, now = Date.now()): boolean {
  const hit = box().entries.get(url);
  return Boolean(hit && !hit.fail && hit.feed && now - hit.at < hit.ttl);
}

export function putFeedCache(url: string, entry: FeedCacheEntry): void {
  const { entries } = box();
  entries.delete(url);
  entries.set(url, entry);
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

export function resetFeedCache(): void {
  const b = box();
  b.entries.clear();
  b.inflight.clear();
}

/** Serve a still-usable stale feed and open a short retry cooldown. */
function serveStale(url: string, hit: FeedCacheEntry | undefined): RemoteFeed | null {
  if (!hit?.feed || Date.now() - hit.at >= FEED_CACHE_STALE_MS) return null;
  putFeedCache(url, {
    ...hit,
    at: Date.now(),
    ttl: FEED_CACHE_FAIL_TTL_MS,
    // Keep this as a readable cache hit so callers do not immediately retry
    // the origin; the short ttl schedules the next conditional revalidation.
    fail: false,
  });
  return hit.feed;
}

export type FeedLoader = (url: string, init?: PublicFetchInit) => Promise<PublicFetchResult>;

/**
 * Load and parse a remote feed. Fresh cache hits skip the network.
 * Conditional GET (ETag / Last-Modified) is used on TTL expiry.
 */
export async function loadRemoteFeed(
  url: string,
  opts: { fetch?: FeedLoader } = {},
): Promise<RemoteFeed | null> {
  const fetchFn = opts.fetch ?? fetchPublic;
  const { entries, inflight } = box();
  const now = Date.now();
  const hit = entries.get(url);
  if (hit && now - hit.at < hit.ttl) {
    if (hit.fail) throw new Error("cached fetch failed");
    return hit.feed;
  }

  const pending = inflight.get(url);
  if (pending) return pending;

  const job = (async (): Promise<RemoteFeed | null> => {
    try {
      const fetched = await fetchFn(url, {
        timeoutMs: 12_000,
        maxBytes: 1_572_864,
        accept: FEED_ACCEPT,
        conditional: hit && !hit.fail
          ? { etag: hit.etag, lastModified: hit.lastModified }
          : undefined,
      });

      if (fetched.status === 304 && hit?.feed) {
        const next = { ...hit, at: Date.now(), ttl: FEED_CACHE_TTL_MS, fail: false };
        putFeedCache(url, next);
        return next.feed;
      }

      const parsed = await parseRemoteFeed(
        fetched.body,
        fetched.contentType,
        fetched.url.toString(),
      );
      if (!parsed) {
        const stale = serveStale(url, hit);
        if (stale) return stale;
        putFeedCache(url, {
          at: Date.now(),
          ttl: FEED_CACHE_FAIL_TTL_MS,
          etag: fetched.etag,
          lastModified: fetched.lastModified,
          contentType: fetched.contentType,
          feed: null,
          finalUrl: fetched.url.toString(),
          fail: true,
        });
        return null;
      }
      putFeedCache(url, {
        at: Date.now(),
        ttl: FEED_CACHE_TTL_MS,
        etag: fetched.etag,
        lastModified: fetched.lastModified,
        contentType: fetched.contentType,
        feed: parsed,
        finalUrl: fetched.url.toString(),
        fail: false,
      });
      return parsed;
    } catch (err) {
      if (err instanceof UnsafeUrlError) {
        putFeedCache(url, {
          at: Date.now(),
          ttl: FEED_CACHE_FAIL_TTL_MS,
          etag: null,
          lastModified: null,
          contentType: "",
          feed: null,
          finalUrl: url,
          fail: true,
        });
        throw err;
      }
      const stale = serveStale(url, hit);
      if (stale) return stale;
      putFeedCache(url, {
        at: Date.now(),
        ttl: FEED_CACHE_FAIL_TTL_MS,
        etag: null,
        lastModified: null,
        contentType: "",
        feed: null,
        finalUrl: url,
        fail: true,
      });
      throw err;
    }
  })();

  inflight.set(url, job);
  try {
    return await job;
  } finally {
    if (inflight.get(url) === job) inflight.delete(url);
  }
}
