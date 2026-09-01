import { prisma } from "@hotai/db";
import { AI_ENABLED, enrichArticle, enrichArticles, type EnrichInput, type EnrichResult } from "@hotai/ai";
import { config } from "./config.js";
import { computeScore } from "./scoring.js";
import { asSignals } from "./merge.js";

export type CandidateArticle = {
  id: number;
  title: string;
  summary: string | null;
  url: string;
  lang: string;
  publishedAt: Date;
  signals: unknown;
  aiAttempts: number;
  source: { name: string; weight: number };
};

type PendingArticle = CandidateArticle & {
  aiLeaseUntil: Date;
};

const AI_PROMPT_VERSION = "enrich-v2";
const MAX_AI_ATTEMPTS = 6;
const AI_LEASE_MS = 15 * 60 * 1000;
const AI_RETRY_BASE_MS = 5 * 60 * 1000;
const AI_RETRY_MAX_MS = 24 * 60 * 60 * 1000;
// The SDK has a 90s timeout plus one retry. If a batch call fails, the
// per-article fallback can therefore take several minutes per row. Extend the
// lease once for that fallback instead of making all workers wait hours to
// recover from an ordinary crash.
const AI_FALLBACK_BUDGET_PER_ARTICLE_MS = 4 * 60 * 1000;
const AI_FALLBACK_LEASE_MAX_MS = 2 * 60 * 60 * 1000;

/**
 * AI enrichment stage. Pulls not-yet-analyzed articles (highest score first,
 * soft-capped per run), enriches them in batches of AI_BATCH_SIZE per LLM call
 * (~50-75% cheaper than article-per-call), and — critically — recomputes each
 * article's score with the fresh aiImportance so the LLM's judgement actually
 * reaches the ranking. A batch whose output can't be aligned falls back to
 * per-article calls. Candidates are leased before the provider call so two
 * fetcher processes cannot enrich the same row concurrently. Transient or
 * malformed provider results are retried with bounded exponential backoff;
 * only repeated failures become terminal.
 */
export async function enrichPendingArticles(): Promise<{ analyzed: number; skipped: number }> {
  if (!AI_ENABLED) {
    return { analyzed: 0, skipped: 0 };
  }
  if (config.aiEnrichPerRun <= 0) return { analyzed: 0, skipped: 0 };

  const now = new Date();
  // A worker can die after consuming its final allowed attempt. Such a row
  // must not remain in `processing` forever merely because the normal claim
  // query correctly excludes attempts >= MAX_AI_ATTEMPTS.
  await recoverExhaustedEnrichmentLeases(now);

  const candidates = await prisma.article.findMany({
    where: {
      aiAttempts: { lt: MAX_AI_ATTEMPTS },
      OR: [
        { aiStatus: "pending" },
        {
          aiStatus: "retry",
          OR: [{ aiNextAttemptAt: null }, { aiNextAttemptAt: { lte: now } }],
        },
        {
          aiStatus: "processing",
          OR: [{ aiLeaseUntil: null }, { aiLeaseUntil: { lte: now } }],
        },
      ],
    },
    orderBy: [{ score: "desc" }, { publishedAt: "desc" }],
    // Read extra candidates so concurrent workers racing for leases do not
    // unnecessarily leave the per-run allowance unused.
    take: Math.min(2_000, Math.max(config.aiEnrichPerRun, config.aiEnrichPerRun * 2)),
    select: {
      id: true,
      title: true,
      summary: true,
      url: true,
      lang: true,
      publishedAt: true,
      signals: true,
      aiAttempts: true,
      source: { select: { name: true, weight: true } },
    },
  });
  if (candidates.length === 0) return { analyzed: 0, skipped: 0 };

  // Claim only the batch a worker is about to send. Pre-claiming the whole
  // run lets later rows sit in a local queue until their lease expires,
  // allowing a second process to duplicate costly provider calls.
  const queue: CandidateArticle[] = [...candidates];
  let claimSlots = config.aiEnrichPerRun;
  let claimedTotal = 0;
  console.log(
    `[ai] considering ${candidates.length} article(s), up to ${config.aiEnrichPerRun} this run in batches of ≤${config.aiBatchSize}…`,
  );

  let analyzed = 0;
  let skipped = 0;
  const workers = Array.from(
    { length: Math.min(config.aiConcurrency, config.aiEnrichPerRun, candidates.length) },
    async () => {
      for (;;) {
        const batch = await claimNextBatch();
        if (batch.length === 0) return;
        claimedTotal += batch.length;
        const outcome = await enrichBatch(batch);
        analyzed += outcome.analyzed;
        skipped += outcome.skipped;
      }
    },
  );
  await Promise.all(workers);

  console.log(`[ai] enrich done — ${claimedTotal} claimed, ${analyzed} ok, ${skipped} skipped`);
  return { analyzed, skipped };

  async function claimNextBatch(): Promise<PendingArticle[]> {
    const batch: PendingArticle[] = [];
    while (batch.length < config.aiBatchSize && queue.length > 0 && claimSlots > 0) {
      const candidate = queue.shift()!;
      // Reserve synchronously before awaiting so concurrent JS workers cannot
      // overshoot the per-run allowance. Return the slot if another process
      // won the database compare-and-swap.
      claimSlots--;
      const claimed = await claimEnrichmentCandidate(candidate);
      if (claimed) batch.push(claimed);
      else claimSlots++;
    }
    return batch;
  }
}

export async function recoverExhaustedEnrichmentLeases(now = new Date()): Promise<number> {
  const recovered = await prisma.article.updateMany({
    where: {
      aiStatus: "processing",
      aiAttempts: { gte: MAX_AI_ATTEMPTS },
      OR: [{ aiLeaseUntil: null }, { aiLeaseUntil: { lte: now } }],
    },
    data: {
      aiStatus: "failed",
      aiNextAttemptAt: null,
      aiLastError: `worker lease expired after ${MAX_AI_ATTEMPTS} attempts`,
      aiLeaseUntil: null,
      aiAnalyzedAt: null,
      aiModel: null,
    },
  });
  return recovered.count;
}

export async function claimEnrichmentCandidate(
  candidate: CandidateArticle,
): Promise<PendingArticle | null> {
  const eligibleAt = new Date();
  const leaseUntil = new Date(eligibleAt.getTime() + AI_LEASE_MS);
  const claimed = await prisma.article.updateMany({
    where: {
      id: candidate.id,
      // Compare-and-swap the observed attempt number so the local value used
      // for backoff/terminal decisions always matches the database increment.
      aiAttempts: candidate.aiAttempts,
      OR: [
        { aiStatus: "pending" },
        {
          aiStatus: "retry",
          OR: [{ aiNextAttemptAt: null }, { aiNextAttemptAt: { lte: eligibleAt } }],
        },
        {
          aiStatus: "processing",
          OR: [{ aiLeaseUntil: null }, { aiLeaseUntil: { lte: eligibleAt } }],
        },
      ],
    },
    data: {
      aiStatus: "processing",
      aiAttempts: { increment: 1 },
      aiNextAttemptAt: null,
      aiLastError: null,
      aiLeaseUntil: leaseUntil,
    },
  });
  return claimed.count === 1
    ? { ...candidate, aiAttempts: candidate.aiAttempts + 1, aiLeaseUntil: leaseUntil }
    : null;
}

async function enrichBatch(batch: PendingArticle[]): Promise<{ analyzed: number; skipped: number }> {
  const inputs = batch.map(toEnrichInput);
  let results = await enrichArticles(inputs);
  if (results === null) {
    // Whole-batch failure (transport / unparsable / misaligned output) —
    // degrade to article-per-call so one bad batch can't stall the queue.
    const fallbackLeaseMs = Math.min(
      AI_FALLBACK_LEASE_MAX_MS,
      AI_LEASE_MS + batch.length * AI_FALLBACK_BUDGET_PER_ARTICLE_MS,
    );
    const renewed = await Promise.all(
      batch.map((article) => renewLease(article, fallbackLeaseMs)),
    );
    results = new Array<EnrichResult | null>(batch.length).fill(null);
    for (let i = 0; i < inputs.length; i++) {
      if (renewed[i]) results[i] = await enrichArticle(inputs[i]!);
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
    await settleFailure(article, "provider returned no valid result");
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
    const updated = await prisma.article.updateMany({
      where: {
        id: article.id,
        aiStatus: "processing",
        aiLeaseUntil: article.aiLeaseUntil,
      },
      data: {
        aiSummaryEn: result.summaryEn || null,
        aiSummaryZh: result.summaryZh || null,
        aiTopics: result.topics,
        aiSentiment: result.sentiment,
        aiImportance: result.importance,
        aiAnalyzedAt: new Date(),
        aiModel: result.model,
        aiStatus: "success",
        aiNextAttemptAt: null,
        aiLastError: null,
        aiLeaseUntil: null,
        aiPromptVersion: AI_PROMPT_VERSION,
        score,
      },
    });
    return updated.count === 1;
  } catch (err) {
    console.warn(`  [ai] persist failed for #${article.id}:`, (err as Error).message);
    await settleFailure(article, "database rejected enrichment result");
    return false;
  }
}

async function renewLease(article: PendingArticle, leaseMs: number): Promise<boolean> {
  const leaseUntil = new Date(Date.now() + leaseMs);
  try {
    const updated = await prisma.article.updateMany({
      where: {
        id: article.id,
        aiStatus: "processing",
        aiLeaseUntil: article.aiLeaseUntil,
      },
      data: { aiLeaseUntil: leaseUntil },
    });
    if (updated.count === 1) article.aiLeaseUntil = leaseUntil;
    return updated.count === 1;
  } catch (err) {
    console.warn(`  [ai] lease renewal failed for #${article.id}:`, (err as Error).message);
    return false;
  }
}

async function settleFailure(article: PendingArticle, reason: string): Promise<void> {
  const transition = failureTransition(article.aiAttempts);
  try {
    await prisma.article.updateMany({
      where: {
        id: article.id,
        aiStatus: "processing",
        aiLeaseUntil: article.aiLeaseUntil,
      },
      data: {
        aiStatus: transition.status,
        aiNextAttemptAt: transition.nextAttemptAt,
        aiLastError: transition.status === "failed"
          ? `${reason} after ${article.aiAttempts} attempts`
          : `${reason}; retry scheduled`,
        aiLeaseUntil: null,
        aiAnalyzedAt: null,
        aiModel: null,
      },
    });
  } catch (err) {
    // The expired-lease recovery at the start of the next cycle prevents a
    // final-attempt database outage from leaving the row stuck forever.
    console.warn(`  [ai] failure settlement failed for #${article.id}:`, (err as Error).message);
  }
}

export function failureTransition(
  attempt: number,
  nowMs: number = Date.now(),
): { status: "retry" | "failed"; nextAttemptAt: Date | null } {
  if (attempt >= MAX_AI_ATTEMPTS) return { status: "failed", nextAttemptAt: null };
  return {
    status: "retry",
    nextAttemptAt: new Date(nowMs + retryDelayMs(attempt)),
  };
}

/** Deterministic bounded backoff; attempt 1 waits 5m, then doubles to 24h. */
export function retryDelayMs(attempt: number): number {
  const exponent = Math.max(0, Math.min(20, Math.trunc(attempt) - 1));
  return Math.min(AI_RETRY_MAX_MS, AI_RETRY_BASE_MS * 2 ** exponent);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
