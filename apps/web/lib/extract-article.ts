import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import DOMPurify from "isomorphic-dompurify";
import { escHtml } from "./feed";

export type ExtractedArticle = {
  title: string;
  contentHtml: string;
  excerpt: string;
};

function injectBase(html: string, url: string): string {
  const base = `<base href="${escHtml(url)}">`;
  if (/<head[\s>]/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${base}`);
  }
  return `<!DOCTYPE html><html><head>${base}</head><body>${html}</body></html>`;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Run Readability + DOMPurify on an already-fetched HTML document. */
export function extractArticle(html: string, url: string): ExtractedArticle | null {
  if (!html.trim()) return null;
  const window = parseHTML(injectBase(html, url));
  let parsed: ReturnType<Readability["parse"]>;
  try {
    parsed = new Readability(window.document as unknown as Document, {
      charThreshold: 40,
      nbTopCandidates: 5,
    }).parse();
  } catch {
    return null;
  }
  if (!parsed?.content) return null;

  const contentHtml = DOMPurify.sanitize(String(parsed.content), {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "link", "meta", "base"],
  }).trim();
  if (!contentHtml) return null;

  const title = (parsed.title || "").trim();
  const excerpt =
    (parsed.excerpt || "").trim() ||
    (parsed.textContent || "").trim().slice(0, 280) ||
    stripTags(contentHtml).slice(0, 280);

  return { title, contentHtml, excerpt };
}
