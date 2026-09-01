import { NextResponse } from "next/server";
import { clientIp } from "@/lib/ask-guard";
import {
  CATALOG_CONCURRENCY,
  CATALOG_ITEMS_PER_SOURCE,
  CATALOG_SUMMARY_LEN,
  MAX_PULL_IDS,
  resolveCatalogSources,
  type CatalogSource,
} from "@/lib/catalog";
import { SITE } from "@/lib/constants";
import { loadRemoteFeed } from "@/lib/feed-cache";
import { parseFeedQuery, pickFeedSummary } from "@/lib/feed";
import { limitIp } from "@/lib/ip-rate-limit";
import type { RemoteFeed, RemoteFeedItem } from "@/lib/parse-remote-feed";
import { mapPool } from "@/lib/pool";
import { getFeedArticles } from "@/lib/queries";
import { UnsafeUrlError } from "@/lib/ssrf";
import { readJsonBody } from "@/lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/catalog/pull  { ids: string[] }
 * Live-fetch allowlisted catalog feeds. Never writes Article/Source.
 * Per-URL memory cache + coalescing lives in lib/feed-cache.ts.
 *
 * Response is a stream of newline-delimited JSON (NDJSON): one `{ t: "s",
 * source }` line per source as it settles, then a final `{ t: "done",
 * okCount, failCount }`. This lets the timeline render each source the moment
 * it arrives instead of blocking on the slowest feed in the batch.
 */

function slimItems(items: RemoteFeedItem[]): RemoteFeedItem[] {
  return items.slice(0, CATALOG_ITEMS_PER_SOURCE).map((it) => ({
    ...it,
    summary:
      it.summary.length <= CATALOG_SUMMARY_LEN
        ? it.summary
        : `${it.summary.slice(0, CATALOG_SUMMARY_LEN - 1)}…`,
  }));
}

/**
 * Site-relative catalog urls (Hot AI's own /feed.json) must not go through
 * fetchPublic — that SSRF-blocks localhost in dev and hairpins production.
 */
async function loadInternalFeed(path: string): Promise<RemoteFeed | null> {
  let parsed: URL;
  try {
    parsed = new URL(path, "https://hotai.local");
  } catch {
    return null;
  }
  if (parsed.pathname !== "/feed.json" && parsed.pathname !== "/feed.xml") return null;
  const q = parseFeedQuery(parsed.searchParams);
  const articles = await getFeedArticles(
    { category: q.category, minImportance: q.minImportance },
    CATALOG_ITEMS_PER_SOURCE,
  );
  return {
    title: SITE.name,
    items: articles.map((a) => ({
      title: a.title,
      url: `${SITE.url}/a/${a.id}`,
      summary: pickFeedSummary(a, q.lang).slice(0, CATALOG_SUMMARY_LEN),
      publishedAt: a.publishedAt.toISOString(),
      image: null,
    })),
  };
}

async function loadCatalogFeed(src: CatalogSource): Promise<RemoteFeed | null> {
  // Preserve the distinction between an honestly empty Hot AI feed and an
  // unavailable database. The caller turns dependency failures into a
  // per-source error instead of showing the internal source as falsely green.
  if (src.url.startsWith("/")) return loadInternalFeed(src.url);
  return loadRemoteFeed(src.url);
}

export type CatalogPullSource = {
  id: string;
  name: string;
  ok: boolean;
  title?: string;
  items: RemoteFeedItem[];
  error?: string;
};

async function fetchCatalogSource(src: CatalogSource): Promise<CatalogPullSource> {
  try {
    const parsed = await loadCatalogFeed(src);
    if (!parsed) {
      return { id: src.id, name: src.name, ok: false, items: [], error: "unrecognized feed" };
    }
    return {
      id: src.id,
      name: src.name,
      ok: true,
      title: parsed.title,
      items: slimItems(parsed.items),
    };
  } catch (err) {
    if (err instanceof UnsafeUrlError) {
      return { id: src.id, name: src.name, ok: false, items: [], error: "blocked url" };
    }
    return { id: src.id, name: src.name, ok: false, items: [], error: "fetch failed" };
  }
}

export async function POST(req: Request) {
  const limited = await limitIp("catalog-pull", clientIp(req), { limit: 40, windowMs: 60_000 });
  if (!limited.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: limited.reason === "limited" ? "rate limited" : "service unavailable",
      },
      {
        status: limited.reason === "limited" ? 429 : 503,
        headers: { "retry-after": String(limited.retryAfterSec) },
      },
    );
  }

  const parsed = await readJsonBody<{ ids?: unknown }>(req, 16 * 1024);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
  const body = parsed.value;
  const rawIds = Array.isArray(body?.ids)
    ? body.ids.filter((id): id is string => typeof id === "string").slice(0, MAX_PULL_IDS)
    : [];
  const sources = resolveCatalogSources(rawIds);
  if (sources.length === 0) {
    return NextResponse.json({ ok: false, error: "no catalog ids" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let okCount = 0;
      let failCount = 0;
      const send = (obj: unknown): void => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
        } catch {
          closed = true;
        }
      };
      try {
        // mapPool bounds concurrency; each source is emitted the moment it
        // settles, so the client never waits on the slowest feed.
        await mapPool(sources, CATALOG_CONCURRENCY, async (src) => {
          const source = await fetchCatalogSource(src);
          if (closed || req.signal.aborted) return;
          if (source.ok) okCount++;
          else failCount++;
          send({ t: "s", source });
        });
        send({ t: "done", okCount, failCount });
      } finally {
        if (!closed) {
          closed = true;
          controller.close();
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
