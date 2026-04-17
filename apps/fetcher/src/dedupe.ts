import { createHash } from "node:crypto";

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "ref_src",
]);

export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = "";
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) u.searchParams.delete(key);
    }
    let s = u.toString();
    if (s.endsWith("/") && u.pathname !== "/") s = s.slice(0, -1);
    return s;
  } catch {
    return raw.trim();
  }
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\[\]\(\){}【】()「」『』"'`“”‘’,.。、!?!?:;——\-_/\\|~·]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sha1(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}

export function hashUrl(url: string): string {
  return sha1(normalizeUrl(url));
}

export function hashTitle(title: string): string {
  return sha1(normalizeTitle(title));
}
