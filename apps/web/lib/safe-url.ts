/**
 * URL policy for values that can reach a browser navigation or resource sink.
 * Remote feeds and database rows are untrusted, so only credential-free
 * HTTP(S) URLs are allowed. Relative URLs are accepted only when a trusted
 * base is supplied (for feed item resolution).
 */
export function safeHttpUrl(raw: unknown, base?: string): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value || value.length > 4096) return null;
  try {
    const parsed = new URL(value, base);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (!parsed.hostname || parsed.username || parsed.password) return null;
    if (isObviouslyPrivateHost(parsed.hostname)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function isSafeHttpUrl(raw: unknown): raw is string {
  return safeHttpUrl(raw) !== null;
}

const SECRET_QUERY_KEY = /(?:^|_)(?:api_key|access_token|auth|authorization|credential|jwt|password|secret|signature|sig|token)(?:_|$)/i;

function isSecretQueryKey(key: string): boolean {
  // Normalize camelCase, dotted, and bracketed spellings before applying
  // boundary checks (for example apiKey, auth[token], and access.token).
  const normalized = key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");
  return SECRET_QUERY_KEY.test(normalized);
}

/** URL safe to publish in feeds/OPML without disclosing embedded credentials. */
export function safeShareableHttpUrl(raw: unknown, base?: string): string | null {
  const safe = safeHttpUrl(raw, base);
  if (!safe) return null;
  const parsed = new URL(safe);
  for (const key of parsed.searchParams.keys()) {
    if (isSecretQueryKey(key)) return null;
  }
  return parsed.toString();
}

/**
 * Browser-side URL sinks cannot do a DNS allowlist check, but they can reject
 * literal/private/local targets and common internal hostnames. This blocks a
 * remote feed from turning an article image/link into a request to the
 * reader's router or loopback services.
 */
function isObviouslyPrivateHost(rawHost: string): boolean {
  const host = rawHost.replace(/^\[|\]$/g, "").replace(/\.+$/, "").toLowerCase();
  if (!host || host === "localhost" || (!host.includes(".") && !host.includes(":"))) return true;
  if ([".localhost", ".local", ".internal", ".localdomain", ".lan", ".home", ".corp", ".intranet", ".arpa"].some((suffix) => host.endsWith(suffix))) {
    return true;
  }

  const ipv4 = parseIpv4(host);
  if (ipv4) {
    const [a, b] = ipv4;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }

  if (host.includes(":")) {
    if (host === "::" || host === "::1") return true;
    if (/^(?:fc|fd)/.test(host) || /^fe[89ab]/.test(host) || /^ff/.test(host) || /^2001:db8(?::|$)/.test(host)) {
      return true;
    }
    const embedded = embeddedIpv4(host);
    if (embedded && isObviouslyPrivateHost(embedded)) return true;
  }
  return false;
}

/** Decode the address forms URL parsers commonly normalize to hexadecimal. */
function embeddedIpv4(host: string): string | null {
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(host)?.[1];
  if (dotted && parseIpv4(dotted)) return dotted;

  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
  if (mapped?.[1] && mapped[2]) return wordsToIpv4(mapped[1], mapped[2]);

  // Standard well-known NAT64 prefix. A deployment may route this directly to
  // the embedded IPv4 target, so private last-32 values are unsafe in a
  // browser navigation/resource sink even though the outer literal is IPv6.
  const nat64 = /^(?:64:ff9b::|64:ff9b:0:0:0:0:)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
  if (nat64?.[1] && nat64[2]) return wordsToIpv4(nat64[1], nat64[2]);
  return null;
}

function wordsToIpv4(highWord: string, lowWord: string): string {
  const high = Number.parseInt(highWord, 16);
  const low = Number.parseInt(lowWord, 16);
  return `${(high >>> 8) & 255}.${high & 255}.${(low >>> 8) & 255}.${low & 255}`;
}

function parseIpv4(host: string): [number, number, number, number] | null {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return null;
  const parts = host.split(".").map(Number);
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return parts as [number, number, number, number];
}
