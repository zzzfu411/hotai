import { NextResponse } from "next/server";
import { clientIp } from "@/lib/ask-guard";
import { isFreshFeedCache, loadRemoteFeed } from "@/lib/feed-cache";
import { limitIp } from "@/lib/ip-rate-limit";
import { UnsafeUrlError } from "@/lib/ssrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

/**
 * GET /api/proxy/feed?url=
 * Pull a user-supplied RSS/Atom/JSON Feed for the in-browser "my subscriptions"
 * timeline. Never writes Article / Source rows.
 */

const PROXY_ITEMS_CAP = 40;
/** MAX_SOURCES is 50 — allow one full cold pull per minute; cache hits are free. */
const PROXY_RATE = 60;
const MAX_URL_LENGTH = 2048;

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url")?.trim() ?? "";
  if (!url) {
    return NextResponse.json({ ok: false, error: "missing url" }, { status: 400 });
  }
  if (url.length > MAX_URL_LENGTH) {
    return NextResponse.json({ ok: false, error: "url too long" }, { status: 414 });
  }

  if (!isFreshFeedCache(url)) {
    const limited = await limitIp("feed-proxy", clientIp(req), { limit: PROXY_RATE, windowMs: 60_000 });
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
  }

  let parsed: Awaited<ReturnType<typeof loadRemoteFeed>>;
  try {
    parsed = await loadRemoteFeed(url);
  } catch (err) {
    if (err instanceof UnsafeUrlError) {
      return NextResponse.json({ ok: false, error: "blocked url" }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: "fetch failed" }, { status: 422 });
  }

  if (!parsed) {
    return NextResponse.json({ ok: false, error: "unrecognized feed" }, { status: 422 });
  }

  return NextResponse.json(
    {
      ok: true,
      title: parsed.title,
      items: parsed.items.slice(0, PROXY_ITEMS_CAP),
    },
    { headers: { "cache-control": "private, max-age=60" } },
  );
}
