import { NextResponse } from "next/server";
import { clientIp } from "@/lib/ask-guard";
import { extractArticle } from "@/lib/extract-article";
import { limitIp } from "@/lib/ip-rate-limit";
import { fetchPublic, UnsafeUrlError } from "@/lib/ssrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

/**
 * POST /api/readability { url }
 * Fetches a page, extracts the article body with Readability, sanitizes HTML.
 * Does not write to Postgres.
 */

const CACHE_MS = 10 * 60 * 1000;
const MAX_CACHE = 80;

type Extracted = { title: string; contentHtml: string; excerpt: string };
type CacheEntry = { at: number; payload: Extracted };
type Box = {
  entries: Map<string, CacheEntry>;
  inflight: Map<string, Promise<Extracted | null>>;
};

const g = globalThis as typeof globalThis & { __hotai_readability?: Box };
function box(): Box {
  if (!g.__hotai_readability) {
    g.__hotai_readability = { entries: new Map(), inflight: new Map() };
  }
  return g.__hotai_readability;
}

function remember(url: string, payload: Extracted): void {
  const { entries } = box();
  entries.delete(url);
  entries.set(url, { at: Date.now(), payload });
  while (entries.size > MAX_CACHE) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

function looksLikeHtml(contentType: string, body: string): boolean {
  const ct = contentType.toLowerCase();
  if (ct.includes("html") || ct.includes("xml") || ct.includes("text/plain") || ct.includes("text/html")) {
    return true;
  }
  if (!ct || ct === "application/octet-stream") {
    return /^\s*</.test(body);
  }
  return false;
}

async function extractFromUrl(url: string): Promise<Extracted | null> {
  const fetched = await fetchPublic(url, {
    timeoutMs: 12_000,
    maxBytes: 1_572_864,
    accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
  });
  if (!looksLikeHtml(fetched.contentType, fetched.body)) return null;
  return extractArticle(fetched.body, fetched.url.toString());
}

export async function POST(req: Request) {
  const limited = limitIp("readability", clientIp(req), { limit: 12, windowMs: 60_000 });
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "rate limited" },
      { status: 429, headers: { "retry-after": String(limited.retryAfterSec) } },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { url?: unknown };
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) {
    return NextResponse.json({ ok: false, error: "missing url" }, { status: 400 });
  }

  const { entries, inflight } = box();
  const hit = entries.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return NextResponse.json({ ok: true, ...hit.payload });
  }

  const pending = inflight.get(url);
  let extracted: Extracted | null;
  try {
    if (pending) {
      extracted = await pending;
    } else {
      const job = extractFromUrl(url).finally(() => {
        if (inflight.get(url) === job) inflight.delete(url);
      });
      inflight.set(url, job);
      extracted = await job;
    }
  } catch (err) {
    if (err instanceof UnsafeUrlError) {
      return NextResponse.json({ ok: false, error: "blocked url" }, { status: 400 });
    }
    if (hit) return NextResponse.json({ ok: true, ...hit.payload });
    return NextResponse.json({ ok: false, error: "fetch failed" }, { status: 422 });
  }

  if (!extracted) {
    if (hit) return NextResponse.json({ ok: true, ...hit.payload });
    return NextResponse.json({ ok: false, error: "extract failed" }, { status: 422 });
  }

  remember(url, extracted);
  return NextResponse.json({ ok: true, ...extracted });
}
