import type { Source } from "@hotai/db";
import { prisma } from "@hotai/db";
import type { RawItem } from "./types.js";
import { hashTitle, hashUrl, normalizeUrl } from "./dedupe.js";
import { computeScore } from "./scoring.js";

export async function upsertArticles(source: Source, items: RawItem[]): Promise<number> {
  let written = 0;
  for (const it of items) {
    if (!it.title || !it.url) continue;
    const url = normalizeUrl(it.url);
    const urlHash = hashUrl(url);
    const titleHash = hashTitle(it.title);

    const score = computeScore({
      sourceWeight: source.weight,
      publishedAt: it.publishedAt,
      title: it.title,
      summary: it.summary,
      signals: it.signals,
    });

    try {
      await prisma.article.upsert({
        where: { urlHash },
        create: {
          sourceId: source.id,
          url,
          urlHash,
          title: it.title,
          titleHash,
          summary: it.summary ?? null,
          author: it.author ?? null,
          publishedAt: it.publishedAt,
          lang: source.lang,
          category: source.category,
          tags: it.tags ?? [],
          score,
          signals: it.signals ? (it.signals as unknown as object) : undefined,
          raw: it.raw ? (it.raw as unknown as object) : undefined,
        },
        update: {
          title: it.title,
          summary: it.summary ?? null,
          score,
          signals: it.signals ? (it.signals as unknown as object) : undefined,
        },
      });
      written++;
    } catch (err) {
      console.warn(`    upsert failed for ${url}:`, (err as Error).message);
    }
  }
  return written;
}
