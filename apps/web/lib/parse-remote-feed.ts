import Parser from "rss-parser";

export type RemoteFeedItem = {
  title: string;
  url: string;
  summary: string;
  publishedAt: string | null;
  image: string | null;
};

export type RemoteFeed = {
  title: string;
  items: RemoteFeedItem[];
};

const parser = new Parser({
  timeout: 12_000,
  headers: { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:thumbnail", "mediaThumb"],
      ["content:encoded", "contentEncoded"],
    ],
  },
});

function isImageUrl(href: string | null | undefined): href is string {
  if (!href) return false;
  if (href.startsWith("data:")) return false;
  return /^https?:\/\//i.test(href);
}

function pickAttrUrl(node: unknown): string | null {
  if (!node) return null;
  if (typeof node === "string") return node;
  if (typeof node !== "object") return null;
  const rec = node as Record<string, unknown>;
  const dollar = rec.$ && typeof rec.$ === "object" ? (rec.$ as Record<string, unknown>) : rec;
  for (const key of ["url", "href", "src"]) {
    const v = dollar[key];
    if (typeof v === "string" && isImageUrl(v)) return v;
  }
  return typeof rec.url === "string" && isImageUrl(rec.url) ? rec.url : null;
}

function firstImgSrc(html: string, baseUrl: string): string | null {
  if (!html) return null;
  const re = /<img\b[^>]*\bsrc=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = absUrl(m[1], baseUrl);
    if (isImageUrl(href)) return href;
  }
  return null;
}

function enclosureImage(it: { enclosure?: { url?: string; type?: string } }): string | null {
  const enc = it.enclosure;
  if (!enc?.url) return null;
  if (enc.type && !/^image\//i.test(enc.type)) return null;
  return isImageUrl(enc.url) ? enc.url : null;
}

/** Pull a card cover from JSON Feed / RSS / Atom / Media RSS / inline HTML. */
export function extractItemImage(
  it: Record<string, unknown>,
  baseUrl: string,
  htmlBits: string[] = [],
): string | null {
  const direct = [it.image, it.banner_image, it.image_url];
  for (const v of direct) {
    const href = typeof v === "string" ? absUrl(v, baseUrl) : null;
    if (isImageUrl(href)) return href;
  }
  const enc = enclosureImage(it as { enclosure?: { url?: string; type?: string } });
  if (enc) return enc;

  const media = it.mediaContent ?? it["media:content"];
  const mediaList = Array.isArray(media) ? media : media ? [media] : [];
  for (const node of mediaList) {
    const href = pickAttrUrl(node);
    if (href) return absUrl(href, baseUrl) ?? href;
  }
  const thumb = pickAttrUrl(it.mediaThumb ?? it["media:thumbnail"]);
  if (thumb) return absUrl(thumb, baseUrl) ?? thumb;

  for (const html of htmlBits) {
    const img = firstImgSrc(html, baseUrl);
    if (img) return img;
  }
  return null;
}

export const DEFAULT_FEED_MAX_ITEMS = 80;
export const DEFAULT_FEED_SUMMARY_LEN = 400;

export type ParseFeedOptions = {
  maxItems?: number;
  summaryLen?: number;
};

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

function absUrl(maybe: string | undefined | null, base: string): string | null {
  if (!maybe) return null;
  try {
    return new URL(maybe, base).toString();
  } catch {
    return null;
  }
}

function toIso(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function looksLikeJson(body: string, contentType: string): boolean {
  const ct = contentType.toLowerCase();
  if (ct.includes("json")) return true;
  const t = body.trimStart();
  return t.startsWith("{") || t.startsWith("[");
}

function parseJsonFeed(body: string, baseUrl: string, opts: ParseFeedOptions = {}): RemoteFeed | null {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return null;
  }
  if (!json || typeof json !== "object") return null;
  const rec = json as Record<string, unknown>;
  if (!Array.isArray(rec.items)) return null;

  const maxItems = opts.maxItems ?? DEFAULT_FEED_MAX_ITEMS;
  const summaryLen = opts.summaryLen ?? DEFAULT_FEED_SUMMARY_LEN;
  const title = typeof rec.title === "string" && rec.title.trim() ? rec.title.trim() : "Feed";
  const items: RemoteFeedItem[] = [];
  for (const raw of rec.items) {
    if (!raw || typeof raw !== "object") continue;
    const it = raw as Record<string, unknown>;
    const itemTitle = typeof it.title === "string" ? it.title.trim() : "";
    const href =
      absUrl(typeof it.url === "string" ? it.url : undefined, baseUrl) ||
      absUrl(typeof it.external_url === "string" ? it.external_url : undefined, baseUrl) ||
      absUrl(typeof it.id === "string" ? it.id : undefined, baseUrl);
    if (!itemTitle || !href) continue;
    const summarySrc =
      (typeof it.summary === "string" && it.summary) ||
      (typeof it.content_text === "string" && it.content_text) ||
      (typeof it.content_html === "string" && it.content_html) ||
      "";
    items.push({
      title: itemTitle,
      url: href,
      summary: truncate(stripHtml(summarySrc), summaryLen),
      publishedAt:
        toIso(typeof it.date_published === "string" ? it.date_published : undefined) ??
        toIso(typeof it.date_modified === "string" ? it.date_modified : undefined),
      image: extractItemImage(it, baseUrl, [
        typeof it.content_html === "string" ? it.content_html : "",
        typeof it.summary === "string" ? it.summary : "",
      ]),
    });
    if (items.length >= maxItems) break;
  }
  return { title, items };
}

async function parseRssAtom(
  body: string,
  baseUrl: string,
  opts: ParseFeedOptions = {},
): Promise<RemoteFeed | null> {
  let feed: Awaited<ReturnType<typeof parser.parseString>>;
  try {
    feed = await parser.parseString(body);
  } catch {
    return null;
  }
  const maxItems = opts.maxItems ?? DEFAULT_FEED_MAX_ITEMS;
  const summaryLen = opts.summaryLen ?? DEFAULT_FEED_SUMMARY_LEN;
  const title = (feed.title || "").trim() || "Feed";
  const items: RemoteFeedItem[] = [];
  for (const it of feed.items ?? []) {
    const itemTitle = (it.title || "").trim();
    const href = absUrl(it.link, baseUrl) || absUrl(it.guid, baseUrl);
    if (!itemTitle || !href) continue;
    const rec = it as unknown as Record<string, unknown>;
    const encoded = typeof rec.contentEncoded === "string" ? rec.contentEncoded : "";
    const summarySrc = it.contentSnippet || it.summary || it.content || encoded || "";
    items.push({
      title: itemTitle,
      url: href,
      summary: truncate(stripHtml(summarySrc), summaryLen),
      publishedAt: toIso(it.isoDate) ?? toIso(it.pubDate),
      image: extractItemImage(rec, baseUrl, [encoded, it.content || "", it.summary || ""]),
    });
    if (items.length >= maxItems) break;
  }
  return { title, items };
}

/** Parse RSS / Atom / JSON Feed 1.1 from a fetched body. Never writes to the DB. */
export async function parseRemoteFeed(
  body: string,
  contentType: string,
  baseUrl: string,
  opts: ParseFeedOptions = {},
): Promise<RemoteFeed | null> {
  if (looksLikeJson(body, contentType)) {
    const json = parseJsonFeed(body, baseUrl, opts);
    if (json) return json;
  }
  return parseRssAtom(body, baseUrl, opts);
}
