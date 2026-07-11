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

// arxiv.org/abs/2401.12345v3, /pdf/2401.12345v3(.pdf) — the version suffix and
// the abs/pdf split make the same paper hash differently (three arXiv feeds
// overlap heavily). Canonical form: https://arxiv.org/abs/<id>.
const ARXIV_PATH_RE = /^\/(abs|pdf)\/(\d{4}\.\d{4,6}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(v\d+)?(\.pdf)?$/i;

export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = "";
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) u.searchParams.delete(key);
    }
    if (u.hostname === "arxiv.org" || u.hostname === "www.arxiv.org" || u.hostname === "export.arxiv.org") {
      const m = u.pathname.match(ARXIV_PATH_RE);
      if (m) {
        u.protocol = "https:";
        u.hostname = "arxiv.org";
        u.pathname = `/abs/${m[2]}`;
        u.search = "";
      }
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
