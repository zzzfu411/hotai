import { prisma } from "@hotai/db";
import { AI_ENABLED, enrichArticle } from "@hotai/ai";
import { config } from "./config.js";

/**
 * Pull recently-fetched articles that haven't been AI-analyzed yet,
 * cap at `maxPerRun`, run with bounded concurrency. Fail-soft on errors.
 */
export async function enrichPendingArticles(): Promise<{ analyzed: number; skipped: number }> {
  if (!AI_ENABLED) {
    return { analyzed: 0, skipped: 0 };
  }
  const rows = await prisma.article.findMany({
    where: { aiAnalyzedAt: null },
    orderBy: [{ score: "desc" }, { publishedAt: "desc" }],
    take: config.aiEnrichPerRun,
    include: { source: { select: { name: true } } },
  });
  if (rows.length === 0) return { analyzed: 0, skipped: 0 };

  console.log(`[ai] enriching ${rows.length} article(s)…`);
  let analyzed = 0;
  let skipped = 0;

  const queue = [...rows];
  const workers = Array.from({ length: config.aiConcurrency }, async () => {
    while (queue.length > 0) {
      const article = queue.shift();
      if (!article) break;
      const result = await enrichArticle({
        title: article.title,
        summary: article.summary,
        url: article.url,
        sourceName: article.source.name,
        lang: article.lang as "en" | "zh",
      });
      if (!result) {
        skipped++;
        // Mark as attempted to avoid hot-looping on a single bad item.
        await prisma.article
          .update({
            where: { id: article.id },
            data: { aiAnalyzedAt: new Date(), aiModel: "skipped" },
          })
          .catch(() => undefined);
        continue;
      }
      await prisma.article
        .update({
          where: { id: article.id },
          data: {
            aiSummaryEn: result.summaryEn || null,
            aiSummaryZh: result.summaryZh || null,
            aiTopics: result.topics,
            aiSentiment: result.sentiment,
            aiImportance: result.importance,
            aiAnalyzedAt: new Date(),
            aiModel: result.model,
          },
        })
        .then(() => {
          analyzed++;
        })
        .catch((err) => {
          skipped++;
          console.warn(`  [ai] persist failed for #${article.id}:`, (err as Error).message);
        });
    }
  });

  await Promise.all(workers);
  console.log(`[ai] enrich done — ${analyzed} ok, ${skipped} skipped`);
  return { analyzed, skipped };
}
