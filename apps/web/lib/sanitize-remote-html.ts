import DOMPurify from "isomorphic-dompurify";
import { parseHTML } from "linkedom";
import { safeHttpUrl } from "./safe-url";

const URL_ATTRS = ["href", "src", "poster", "cite", "action", "formaction", "xlink:href"] as const;

/**
 * Sanitize remote HTML, then normalize every browser URL sink against the
 * trusted fetched-page base. DOMPurify handles script/DOM clobbering; this
 * second pass also removes private/local navigation and resource targets.
 */
export function sanitizeRemoteHtml(raw: string, baseUrl: string): string {
  const clean = DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "link", "meta", "base"],
    FORBID_ATTR: ["style"],
    ADD_ATTR: ["target", "rel"],
  }).trim();
  if (!clean) return "";

  const { document } = parseHTML(`<!doctype html><html><body>${clean}</body></html>`);
  for (const element of Array.from(document.body.querySelectorAll("*"))) {
    element.removeAttribute("srcset");
    for (const attr of URL_ATTRS) {
      const value = element.getAttribute(attr);
      if (value == null) continue;
      if (attr === "href" && value.trim().startsWith("#")) continue;
      const safe = safeHttpUrl(value, baseUrl);
      if (safe) element.setAttribute(attr, safe);
      else element.removeAttribute(attr);
    }
    if (element.getAttribute("target")?.toLowerCase() === "_blank") {
      element.setAttribute("rel", "noopener noreferrer");
    }
  }
  return document.body.innerHTML.trim();
}
