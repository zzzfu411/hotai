import { lookup as dnsLookup } from "node:dns/promises";
import { BlockList, isIPv4, isIPv6, isIP } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";

/**
 * SSRF guard for user-supplied URLs (readability + custom-feed proxy).
 * Blocks non-http(s), localhost / metadata hostnames, IP literals in private
 * ranges, and (when DNS works) resolved addresses in those same ranges.
 */

export const MAX_FETCH_BYTES = 1_572_864; // 1.5 MiB
export const DEFAULT_FETCH_TIMEOUT_MS = 12_000;
export const HOTAI_UA = "HotAI-Bot/1.0 (+https://hotai.yeuxark.com)";

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

const PRIVATE_V4 = new BlockList();
PRIVATE_V4.addSubnet("0.0.0.0", 8, "ipv4");
PRIVATE_V4.addSubnet("10.0.0.0", 8, "ipv4");
PRIVATE_V4.addSubnet("100.64.0.0", 10, "ipv4");
PRIVATE_V4.addSubnet("127.0.0.0", 8, "ipv4");
PRIVATE_V4.addSubnet("169.254.0.0", 16, "ipv4");
PRIVATE_V4.addSubnet("172.16.0.0", 12, "ipv4");
PRIVATE_V4.addSubnet("192.168.0.0", 16, "ipv4");
PRIVATE_V4.addSubnet("198.18.0.0", 15, "ipv4");
PRIVATE_V4.addSubnet("224.0.0.0", 4, "ipv4");
PRIVATE_V4.addSubnet("240.0.0.0", 4, "ipv4");

/** Clash/V2Ray fake-ip (RFC 2544). Block as a URL IP literal; allow as a DNS answer. */
const FAKE_IP_V4 = new BlockList();
FAKE_IP_V4.addSubnet("198.18.0.0", 15, "ipv4");

const PRIVATE_V6 = new BlockList();
PRIVATE_V6.addAddress("::", "ipv6");
PRIVATE_V6.addAddress("::1", "ipv6");
PRIVATE_V6.addSubnet("fc00::", 7, "ipv6");
PRIVATE_V6.addSubnet("fe80::", 10, "ipv6");
PRIVATE_V6.addSubnet("ff00::", 8, "ipv6");
PRIVATE_V6.addSubnet("2001:db8::", 32, "ipv6");

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
  "metadata.google.com",
  "metadata.goog",
  "internal",
  "instance-data",
  "kubernetes",
  "invalid",
]);

const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".localdomain",
  ".lan",
  ".home",
  ".corp",
  ".intranet",
  ".arpa",
];

export function isBlockedIPv4(ip: string): boolean {
  return PRIVATE_V4.check(ip, "ipv4");
}

export function isBlockedIPv6(ip: string): boolean {
  const v4 = mappedIPv4(ip);
  if (v4) return isBlockedIPv4(v4);
  return PRIVATE_V6.check(ip, "ipv6");
}

export function isBlockedAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isBlockedIPv4(ip);
  if (kind === 6) return isBlockedIPv6(ip);
  return true;
}

function isFakeIpAnswer(ip: string): boolean {
  const v4 = isIPv4(ip) ? ip : mappedIPv4(ip);
  return Boolean(v4 && FAKE_IP_V4.check(v4, "ipv4"));
}

/** DNS answers: skip Clash fake-ip, still reject LAN/loopback/metadata. */
export function isBlockedResolvedAddress(ip: string): boolean {
  if (isFakeIpAnswer(ip)) return false;
  return isBlockedAddress(ip);
}

/** IPv4-mapped / NAT64 last-32 → dotted IPv4, else null. */
function mappedIPv4(ip: string): string | null {
  const s = stripZone(ip).toLowerCase();
  const dotted = s.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted?.[1] && isIPv4(dotted[1])) return dotted[1];

  const hexMapped = s.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMapped?.[1] && hexMapped[2]) {
    const hi = parseInt(hexMapped[1], 16);
    const lo = parseInt(hexMapped[2], 16);
    return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
  }

  const nat64 = s.match(
    /^(?:64:ff9b::|64:ff9b:0:0:0:0:)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/,
  );
  if (nat64?.[1] && nat64[2]) {
    const hi = parseInt(nat64[1], 16);
    const lo = parseInt(nat64[2], 16);
    return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
  }
  return null;
}

function stripZone(ip: string): string {
  const i = ip.indexOf("%");
  return i === -1 ? ip : ip.slice(0, i);
}

function normalizeHost(host: string): string {
  return host.replace(/\.+$/, "").toLowerCase();
}

export function isBlockedHostname(host: string): boolean {
  const h = normalizeHost(host);
  if (!h) return true;
  if (BLOCKED_HOSTS.has(h)) return true;
  if (BLOCKED_HOST_SUFFIXES.some((sfx) => h.endsWith(sfx))) return true;
  if (!h.includes(".")) return true; // single-label (localhost already covered)
  return false;
}

/**
 * Hostnames that are IPv4 in unusual forms (decimal, 1–3 octets, leading zeros)
 * that `net.isIP` does not always flag.
 */
export function hostnameAsIPv4(host: string): string | null {
  const h = normalizeHost(host);
  if (isIPv4(h)) return h;
  if (!/^\d+(?:\.\d+){0,3}$/.test(h)) return null;
  const parts = h.split(".");
  const nums = parts.map((p) => {
    // Leading zeros / octal (0177) are ambiguous across parsers — treat as blocked.
    if (!/^\d+$/.test(p)) return null;
    if (p.length > 1 && p.startsWith("0")) return null;
    const n = Number(p);
    return Number.isInteger(n) && n >= 0 ? n : null;
  });
  if (nums.some((n) => n == null)) return "127.0.0.1";
  const [a, b, c, d] = nums as number[];
  if (parts.length === 1 && a! <= 0xffffffff) {
    const n = a!;
    return `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`;
  }
  if (parts.length === 2 && a! <= 255 && b! <= 0xffffff) {
    return `${a}.${(b! >>> 16) & 255}.${(b! >>> 8) & 255}.${b! & 255}`;
  }
  if (parts.length === 3 && a! <= 255 && b! <= 255 && c! <= 0xffff) {
    return `${a}.${b}.${(c! >>> 8) & 255}.${c! & 255}`;
  }
  if (parts.length === 4 && nums.every((n) => n! <= 255)) {
    return `${a}.${b}.${c}.${d}`;
  }
  return "127.0.0.1";
}

/**
 * Parse + block by scheme / hostname / IP literal. No DNS.
 * Throws {@link UnsafeUrlError}.
 */
export function parsePublicHttpUrl(raw: string): URL {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2048) {
    throw new UnsafeUrlError("invalid url");
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new UnsafeUrlError("invalid url");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("only http/https allowed");
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError("url credentials not allowed");
  }

  const host = url.hostname;
  if (!host) throw new UnsafeUrlError("invalid host");

  if (isIPv4(host) || hostnameAsIPv4(host)) {
    const ip = isIPv4(host) ? host : hostnameAsIPv4(host)!;
    if (isBlockedIPv4(ip)) throw new UnsafeUrlError("private address");
  } else if (isIPv6(host) || isIPv6(stripZone(host))) {
    if (isBlockedIPv6(stripZone(host))) throw new UnsafeUrlError("private address");
  } else if (isBlockedHostname(host)) {
    throw new UnsafeUrlError("blocked host");
  }

  return url;
}

/** Syntax check then resolve DNS; reject if any answer is private. */
export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  const url = parsePublicHttpUrl(raw);
  const host = url.hostname;
  if (isIPv4(host) || isIPv6(host) || hostnameAsIPv4(host)) {
    return url;
  }
  await assertPublicHostname(host);
  return url;
}

export async function resolvePublicHostname(
  hostname: string,
): Promise<{ address: string; family: number }> {
  if (isBlockedHostname(hostname)) {
    throw new UnsafeUrlError("blocked host");
  }
  const key = hostname.toLowerCase();
  const memo = dnsMemo();
  const now = Date.now();
  pruneDnsMemo(memo, now);
  const cached = memo.get(key);
  if (cached && now - cached.at < cached.ttl) {
    if (cached.err) throw new UnsafeUrlError(cached.err);
    if (cached.address && cached.family) {
      return { address: cached.address, family: cached.family };
    }
  }

  let answers: { address: string; family: number }[];
  try {
    answers = await lookupAll(hostname, DNS_LOOKUP_TIMEOUT_MS);
  } catch {
    rememberDnsMemo(memo, key, { at: now, ttl: DNS_TTL_FAIL_MS, err: "dns lookup failed" }, now);
    throw new UnsafeUrlError("dns lookup failed");
  }
  if (!answers.length) {
    rememberDnsMemo(memo, key, { at: now, ttl: DNS_TTL_FAIL_MS, err: "dns lookup failed" }, now);
    throw new UnsafeUrlError("dns lookup failed");
  }
  for (const a of answers) {
    if (isBlockedResolvedAddress(a.address)) {
      rememberDnsMemo(memo, key, { at: now, ttl: DNS_TTL_OK_MS, err: "private address" }, now);
      throw new UnsafeUrlError("private address");
    }
  }
  const pin = answers[0]!;
  rememberDnsMemo(
    memo,
    key,
    { at: now, ttl: DNS_TTL_OK_MS, address: pin.address, family: pin.family },
    now,
  );
  return pin;
}

export async function assertPublicHostname(hostname: string): Promise<void> {
  await resolvePublicHostname(hostname);
}

function publicAgent(servername: string): Agent {
  // Intentionally no custom `lookup` pin. On Node 22, undici 6's
  // `cb(null, address, family)` form throws ERR_INVALID_IP_ADDRESS and
  // the catalog timeline comes back empty. Hostname was already
  // allowlisted by resolvePublicHostname() just above the connect.
  return new Agent({
    connect: {
      servername,
    },
  });
}

export type PublicFetchResult = {
  url: URL;
  status: number;
  contentType: string;
  body: string;
  etag: string | null;
  lastModified: string | null;
};

export type PublicFetchInit = {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
  accept?: string;
  /** Send If-None-Match / If-Modified-Since; 304 is returned instead of thrown. */
  conditional?: { etag?: string | null; lastModified?: string | null };
};

const DNS_TTL_OK_MS = 20_000;
const DNS_TTL_FAIL_MS = 5_000;
const DNS_LOOKUP_TIMEOUT_MS = 3_000;
const DNS_MEMO_MAX_ENTRIES = 512;

type DnsMemo = { at: number; ttl: number; err?: string; address?: string; family?: number };

const dnsState = globalThis as typeof globalThis & { __hotai_dns_memo?: Map<string, DnsMemo> };

function dnsMemo(): Map<string, DnsMemo> {
  return (dnsState.__hotai_dns_memo ??= new Map());
}

/** Keep the process-wide DNS cache bounded even when every entry is live. */
function pruneDnsMemo(memo: Map<string, DnsMemo>, now: number): void {
  for (const [host, row] of memo) {
    if (now - row.at >= row.ttl) memo.delete(host);
  }
}

function rememberDnsMemo(
  memo: Map<string, DnsMemo>,
  key: string,
  row: DnsMemo,
  now: number,
): void {
  pruneDnsMemo(memo, now);
  // Refreshing a key should not evict an unrelated entry.
  memo.delete(key);
  while (memo.size >= DNS_MEMO_MAX_ENTRIES) {
    const oldest = memo.keys().next().value;
    if (oldest === undefined) break;
    memo.delete(oldest);
  }
  memo.set(key, row);
}

async function lookupAll(
  hostname: string,
  timeoutMs: number,
): Promise<{ address: string; family: number }[]> {
  return Promise.race([
    dnsLookup(hostname, { all: true, verbatim: true }),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("dns timeout")), timeoutMs);
    }),
  ]);
}

/**
 * GET a user-supplied URL after SSRF checks. Re-validates every redirect hop.
 * Caps body size; aborts on timeout.
 */
export async function fetchPublic(
  raw: string,
  init: PublicFetchInit = {},
): Promise<PublicFetchResult> {
  const timeoutMs = init.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const maxBytes = init.maxBytes ?? MAX_FETCH_BYTES;
  const maxRedirects = init.maxRedirects ?? 5;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const extra: Record<string, string> = { ...(init.headers ?? {}) };
  if (init.conditional?.etag) extra["if-none-match"] = init.conditional.etag;
  if (init.conditional?.lastModified) extra["if-modified-since"] = init.conditional.lastModified;

  let dispatcher: Agent | undefined;
  try {
    let current = parsePublicHttpUrl(raw);
    for (let hop = 0; hop <= maxRedirects; hop++) {
      dispatcher?.destroy();
      dispatcher = undefined;
      const host = current.hostname;
      const literal = isIPv4(host) || isIPv6(host) || isIPv6(stripZone(host)) || hostnameAsIPv4(host);
      if (!literal) {
        await resolvePublicHostname(host);
        dispatcher = publicAgent(host);
      }

      // undici, not Next-patched fetch: Next would auto-follow redirects and
      // skip the per-hop SSRF re-check. Hostname allowlisting happens before
      // connect; we do not pin lookup() because Node 22 rejects that form.
      const res = await undiciFetch(current.href, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        dispatcher,
        headers: {
          "user-agent": HOTAI_UA,
          accept: init.accept ?? "*/*",
          "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
          ...extra,
        },
      });

      if (isRedirect(res.status)) {
        const loc = res.headers.get("location");
        try {
          await res.body?.cancel();
        } catch {
          /* already closed */
        }
        if (!loc) throw new UnsafeUrlError("redirect without location");
        if (hop === maxRedirects) throw new UnsafeUrlError("too many redirects");
        const next = new URL(loc, current);
        current = parsePublicHttpUrl(next.toString());
        continue;
      }

      const etag = res.headers.get("etag");
      const lastModified = res.headers.get("last-modified");

      if (res.status === 304) {
        return {
          url: current,
          status: 304,
          contentType: res.headers.get("content-type") ?? "",
          body: "",
          etag,
          lastModified,
        };
      }

      if (res.status < 200 || res.status >= 400) {
        throw new Error(`HTTP ${res.status}`);
      }

      const length = Number(res.headers.get("content-length") ?? "");
      if (Number.isFinite(length) && length > maxBytes) {
        throw new Error("response too large");
      }

      const body = await readCapped(res, maxBytes);
      return {
        url: current,
        status: res.status,
        contentType: res.headers.get("content-type") ?? "",
        body,
        etag,
        lastModified,
      };
    }
    throw new UnsafeUrlError("too many redirects");
  } catch (err) {
    if (err instanceof UnsafeUrlError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("fetch timeout");
    }
    throw err;
  } finally {
    clearTimeout(timer);
    dispatcher?.destroy();
  }
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

type StreamReader = {
  read: () => Promise<{ done: boolean; value?: Uint8Array }>;
  cancel?: () => Promise<void> | void;
  releaseLock?: () => void;
};

async function readCapped(
  res: { body: { getReader: () => StreamReader } | null },
  maxBytes: number,
): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel?.();
        throw new Error("response too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(out);
}
