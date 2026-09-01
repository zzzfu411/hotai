import { safeHttpUrl } from "./safe-url";

export type AskCitationSource = {
  index: number;
  id: number;
  title: string;
  source: string;
  url: string;
};

export function buildAskCitationSources(
  articles: Array<{ id: number; title: string; url: string; source: { name: string } }>,
): AskCitationSource[] {
  return articles.flatMap((article, offset) => {
    const url = safeHttpUrl(article.url);
    if (!url || !Number.isInteger(article.id) || article.id <= 0) return [];
    return [{
      index: offset + 1,
      id: article.id,
      title: article.title.trim().slice(0, 200),
      source: article.source.name.trim().slice(0, 120),
      url,
    }];
  });
}

/** Validate database/SSE JSON before it reaches links in the browser. */
export function sanitizeAskCitationSources(value: unknown): AskCitationSource[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  const sources: AskCitationSource[] = [];
  for (const item of value.slice(0, 25)) {
    if (!item || typeof item !== "object") continue;
    const source = item as Record<string, unknown>;
    const index = Number(source.index);
    const id = Number(source.id);
    const url = safeHttpUrl(source.url);
    const title = typeof source.title === "string" ? source.title.trim().slice(0, 200) : "";
    const name = typeof source.source === "string" ? source.source.trim().slice(0, 120) : "";
    if (
      !Number.isInteger(index) || index <= 0 || index > 25 || seen.has(index) ||
      !Number.isInteger(id) || id <= 0 || !url || !title
    ) continue;
    seen.add(index);
    sources.push({ index, id, title, source: name, url });
  }
  return sources.sort((a, b) => a.index - b.index);
}
