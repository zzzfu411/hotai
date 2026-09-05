import { escXml } from "./feed";
import { safeHttpUrl, safeShareableHttpUrl } from "./safe-url";

/** localStorage key for in-browser custom feeds — never written to Postgres. */
export const CUSTOM_SOURCES_KEY = "hotai.customSources";

export const MAX_SOURCES = 50;

export type CustomSource = {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
};

export type OpmlOutline = {
  name: string;
  url: string;
};

export function newSourceId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `src_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Accept http(s). Bare hostnames get an https:// prefix. */
export function normalizeFeedUrl(raw: string): string | null {
  let t = raw.trim();
  if (!t) return null;
  if (t.length > 4096) return null;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(t)) t = `https://${t}`;
  // Match the server-side policy early so a private/credential-bearing URL
  // cannot sit in localStorage only to fail later after a wasted request.
  return safeHttpUrl(t);
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || url;
  } catch {
    return url;
  }
}

function unescapeXml(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function parseAttrs(tagInner: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tagInner))) {
    out[m[1]!.toLowerCase()] = unescapeXml(m[2] ?? m[3] ?? "").trim();
  }
  return out;
}

/** Flatten OPML `outline` nodes that have `xmlUrl`. Folders without a feed URL are skipped. */
export function parseOpml(xml: string): OpmlOutline[] {
  if (!xml) return [];
  const stripped = xml.replace(/^\uFEFF/, "").replace(/<!--[\s\S]*?-->/g, "");
  const outlines: OpmlOutline[] = [];
  const seen = new Set<string>();
  const re = /<outline\b([^>]*)\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripped))) {
    const attrs = parseAttrs(m[1] ?? "");
    const url = normalizeFeedUrl(attrs.xmlurl ?? "");
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const name = (attrs.title || attrs.text || hostOf(url)).trim() || hostOf(url);
    outlines.push({ name, url });
  }
  return outlines;
}

export function exportOpml(sources: CustomSource[], title = "Hot AI · 我的订阅"): string {
  const now = new Date().toUTCString();
  const body = sources
    .map((s) => {
      const url = safeShareableHttpUrl(s.url);
      return url
        ? `    <outline type="rss" text="${escXml(s.name)}" title="${escXml(s.name)}" xmlUrl="${escXml(url)}"/>`
        : "";
    })
    .filter(Boolean)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>${escXml(title)}</title>
    <dateCreated>${escXml(now)}</dateCreated>
  </head>
  <body>
${body}
  </body>
</opml>
`;
}

export function parseCustomSources(raw: string | null): CustomSource[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    const out: CustomSource[] = [];
    const seen = new Set<string>();
    const seenIds = new Set<string>();
    for (const item of v) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      const url = typeof rec.url === "string" ? normalizeFeedUrl(rec.url) : null;
      if (!url || seen.has(url)) continue;
      let id = typeof rec.id === "string" && rec.id.trim() ? rec.id.trim() : newSourceId();
      if (seenIds.has(id)) id = newSourceId();
      const name =
        typeof rec.name === "string" && rec.name.trim() ? rec.name.trim() : hostOf(url);
      const enabled = rec.enabled !== false;
      seen.add(url);
      seenIds.add(id);
      out.push({ id, name, url, enabled });
      if (out.length >= MAX_SOURCES) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function loadCustomSources(): CustomSource[] {
  if (typeof window === "undefined") return [];
  try {
    return parseCustomSources(window.localStorage.getItem(CUSTOM_SOURCES_KEY));
  } catch {
    return [];
  }
}

export function saveCustomSources(sources: CustomSource[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(CUSTOM_SOURCES_KEY, JSON.stringify(sources));
    return true;
  } catch {
    /* quota / private mode */
    return false;
  }
}

export function addSource(
  existing: CustomSource[],
  urlRaw: string,
  nameRaw?: string,
): { sources: CustomSource[]; added: CustomSource | null; error?: "invalid" | "duplicate" | "full" } {
  const url = normalizeFeedUrl(urlRaw);
  if (!url) return { sources: existing, added: null, error: "invalid" };
  if (existing.some((s) => s.url === url)) return { sources: existing, added: null, error: "duplicate" };
  if (existing.length >= MAX_SOURCES) return { sources: existing, added: null, error: "full" };
  const name = (nameRaw ?? "").trim() || hostOf(url);
  const added: CustomSource = { id: newSourceId(), name, url, enabled: true };
  return { sources: [...existing, added], added };
}

export function mergeOpml(
  existing: CustomSource[],
  xml: string,
): { sources: CustomSource[]; added: number; skipped: number } {
  const outlines = parseOpml(xml);
  const sources = existing.slice();
  const seen = new Set(sources.map((s) => s.url));
  let added = 0;
  let skipped = 0;
  for (const o of outlines) {
    if (seen.has(o.url) || sources.length >= MAX_SOURCES) {
      skipped++;
      continue;
    }
    seen.add(o.url);
    sources.push({ id: newSourceId(), name: o.name, url: o.url, enabled: true });
    added++;
  }
  return { sources, added, skipped };
}

export function isPlaceholderName(source: Pick<CustomSource, "name" | "url">): boolean {
  return source.name === hostOf(source.url);
}

export function formatFeedError(
  input: { status: number; error: string; retryAfterSec?: number },
  lang: "zh" | "en",
): string {
  const zh = lang === "zh";
  const rate = input.status === 429 || /rate\s*limit/i.test(input.error);
  if (rate) {
    const wait =
      input.retryAfterSec != null && Number.isFinite(input.retryAfterSec)
        ? Math.max(1, Math.round(input.retryAfterSec))
        : 0;
    if (zh) {
      return wait > 0 ? `请求太频繁（429）。请 ${wait} 秒后再试。` : "请求太频繁（429）。请稍后再试。";
    }
    return wait > 0 ? `Rate limited (429). Retry in ${wait}s.` : "Rate limited (429). Try again shortly.";
  }
  const known: Record<string, { zh: string; en: string }> = {
    "blocked url": { zh: "这个地址被拒绝（内网 / 非法协议）。", en: "Blocked URL (private or disallowed)." },
    "fetch failed": { zh: "拉取失败。", en: "Fetch failed." },
    "unrecognized feed": { zh: "无法识别为 RSS / Atom / JSON Feed。", en: "Not a recognized RSS, Atom, or JSON Feed." },
    "missing url": { zh: "缺少 url 参数。", en: "Missing url." },
  };
  const hit = known[input.error];
  if (hit) return zh ? hit.zh : hit.en;
  if (input.error) return input.error;
  return zh ? "拉取失败。" : "Fetch failed.";
}
