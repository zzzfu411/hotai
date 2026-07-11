import { prisma } from "@hotai/db";
import { AI_ENABLED, enrichArticle, enrichArticles, type EnrichInput, type EnrichResult } from "@hotai/ai";
import { config } from "./config.js";
import { computeScore } from "./scoring.js";
import { asSignals } from "./merge.js";

type PendingArticle = {
  id: number;
  title: string;
  summary: string | null;
  url: string;
  lang: string;
  publishedAt: Date;
  signals: unknown;
  source: { name: string; weight: number };
};

/**
 * AI enrichment stage. Pulls not-yet-analyzed articles (highest score first,
 * soft-capped per run), enriches them in batches of AI_BATCH_SIZE per LLM call
 * (~50-75% cheaper than article-per-call), and — critically — recomputes each
 * article's score with the fresh aiImportance so the LLM's judgement actually
 * reaches the ranking. A batch whose output can't be aligned falls back to
 * per-article calls; an article that still fails is marked aiModel="skipped"
 * so we never hot-loop on a bad item.
 */
export async function enrichPendingArticles(): Promise<{ analyzed: number; skipped: number }> {
  if (!AI_ENABLED) {
    return { analyzed: 0, skipped: 0 };
  }
  const rows: PendingArticle[] = await prisma.article.findMany({
    where: { aiAnalyzedAt: null },
    orderBy: [{ score: "desc" }, { publishedAt: "desc" }],
    take: config.aiEnrichPerRun,
    select: {
      id: true,
      title: true,
      summary: true,
      url: true,
      lang: true,
      publishedAt: true,
      signals: true,
      source: { select: { name: true, weight: true } },
    },
  });
  if (rows.length === 0) return { analyzed: 0, skipped: 0 };

  const batches = chunk(rows, config.aiBatchSize);
  console.log(
    `[ai] enriching ${rows.length} article(s) in ${batches.length} batch(es) of ≤${config.aiBatchSize}…`,
  );

  let analyzed = 0;
  let skipped = 0;
  const queue = [...batches];
  const workers = Array.from(
    { length: Math.min(config.aiConcurrency, batches.length) },
    async () => {
      for (;;) {
        const batch = queue.shift();
        if (!batch) return;
        const outcome = await enrichBatch(batch);
        analyzed += outcome.analyzed;
        skipped += outcome.skipped;
      }
    },
  );
  await Promise.all(workers);

  console.log(`[ai] enrich done — ${analyzed} ok, ${skipped} skipped`);
  return { analyzed, skipped };
}

async function enrichBatch(batch: PendingArticle[]): Promise<{ analyzed: number; skipped: number }> {
  const inputs = batch.map(toEnrichInput);
  let results = await enrichArticles(inputs);
  if (results === null) {
    // Whole-batch failure (transport / unparsable / misaligned output) —
    // degrade to article-per-call so one bad batch can't stall the queue.
    results = [];
    for (const input of inputs) {
      results.push(await enrichArticle(input));
    }
  }

  let analyzed = 0;
  let skipped = 0;
  for (let i = 0; i < batch.length; i++) {
    const ok = await persistEnrichment(batch[i]!, results[i] ?? null);
    if (ok) analyzed++;
    else skipped++;
  }
  return { analyzed, skipped };
}

function toEnrichInput(a: PendingArticle): EnrichInput {
  return {
    title: a.title,
    summary: a.summary,
    url: a.url,
    sourceName: a.source.name,
    lang: a.lang as "en" | "zh",
  };
}

async function persistEnrichment(article: PendingArticle, result: EnrichResult | null): Promise<boolean> {
  if (!result) {
    // Mark as attempted to avoid hot-looping on a single bad item.
    await prisma.article
      .update({
        where: { id: article.id },
        data: { aiAnalyzedAt: new Date(), aiModel: "skipped" },
      })
      .catch(() => undefined);
    return false;
  }

  // Enrichment happens after upsert, so the stored score was computed with
  // aiImportance=0 — write the re-scored value back alongside the AI fields.
  const score = computeScore({
    sourceWeight: article.source.weight,
    publishedAt: article.publishedAt,
    title: article.title,
    summary: article.summary,
    signals: asSignals(article.signals),
    aiImportance: result.importance,
  });

  try {
    await prisma.article.update({
      where: { id: article.id },
      data: {
        aiSummaryEn: result.summaryEn || null,
        aiSummaryZh: result.summaryZh || null,
        aiTopics: result.topics,
        aiSentiment: result.sentiment,
        aiImportance: result.importance,
        aiAnalyzedAt: new Date(),
        aiModel: result.model,
        score,
      },
    });
    return true;
  } catch (err) {
    console.warn(`  [ai] persist failed for #${article.id}:`, (err as Error).message);
    return false;
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
