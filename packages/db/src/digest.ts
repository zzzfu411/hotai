import type { Digest, Prisma } from "@prisma/client";
import { prisma } from "./client.js";
import {
  acquireCoordinationLease,
  finishCoordinationLease,
  startCoordinationHeartbeat,
  withCoordinationLease,
  type CoordinationLeaseClaim,
} from "./coordination.js";

const DAY_MS = 24 * 3600 * 1000;

/** Stories handed to the model, and the fewest that make a brief worth writing. */
export const DIGEST_CORPUS_SIZE = 40;
export const DIGEST_MIN_ARTICLES = 5;

/** Midnight UTC: the editorial day that keys Digest rows in every process. */
export function startOfUtcDay(d: Date = new Date()): Date {
  const day = new Date(d);
  day.setUTCHours(0, 0, 0, 0);
  return day;
}

export type DigestCorpusArticle = {
  id: number;
  title: string;
  summaryEn: string | null;
  url: string;
  sourceName: string;
  score: number;
  topics: string[];
};

/** The day's top-scored stories, as the digest model sees them. */
export async function loadDigestCorpus(day: Date): Promise<DigestCorpusArticle[]> {
  const rows = await prisma.article.findMany({
    where: { publishedAt: { gte: day, lt: new Date(day.getTime() + DAY_MS) } },
    orderBy: [{ score: "desc" }, { publishedAt: "desc" }],
    take: DIGEST_CORPUS_SIZE,
    select: {
      id: true,
      title: true,
      url: true,
      score: true,
      summary: true,
      aiSummaryEn: true,
      aiTopics: true,
      source: { select: { name: true } },
    },
  });
  return rows.map((a) => ({
    id: a.id,
    title: a.title,
    summaryEn: a.aiSummaryEn ?? a.summary ?? null,
    url: a.url,
    sourceName: a.source.name,
    score: a.score,
    topics: a.aiTopics,
  }));
}

export type DigestContent = {
  headline: string;
  overview: string;
  bullets: unknown[];
  themes: string[];
  model: string;
};

export type DigestRun =
  /** Too few stories today to write about. */
  | { status: "skipped"; articles: number }
  /** Another process holds the lease and is writing it now. */
  | { status: "busy"; leaseUntil: Date }
  /** A row that `keep` accepts appeared before the model was called. */
  | { status: "current"; row: Digest }
  /** The model returned nothing usable; the lease is released as failed. */
  | { status: "failed" }
  | { status: "saved"; row: Digest };

/**
 * Write the digest for `day` under the shared `digest:<day>` lease. The fetcher
 * (scheduled refresh) and the web app (first visitor of the day) both go
 * through here, so they cannot both pay for the same brief: claim the lease,
 * recheck the row under it, call the model while renewing the lease, and
 * commit only while the lease is still ours.
 */
export async function runDigestGeneration(options: {
  day: Date;
  leaseMs: number;
  /** Whether a row found after claiming the lease is good enough to keep. */
  keep: (row: Digest) => boolean;
  generate: (corpus: DigestCorpusArticle[]) => Promise<DigestContent | null>;
}): Promise<DigestRun> {
  const { day, leaseMs, keep, generate } = options;
  const corpus = await loadDigestCorpus(day);
  if (corpus.length < DIGEST_MIN_ARTICLES) return { status: "skipped", articles: corpus.length };

  const lease = await acquireCoordinationLease(`digest:${day.toISOString().slice(0, 10)}`, leaseMs);
  if (!lease.acquired) return { status: "busy", leaseUntil: lease.leaseUntil };

  const heartbeat = startCoordinationHeartbeat(lease, leaseMs);
  try {
    // Close the read/claim race: another process may have finished just
    // before this lease was granted.
    const raced = await prisma.digest.findUnique({ where: { date: day } });
    if (raced && keep(raced)) {
      await settle(lease, "success");
      return { status: "current", row: raced };
    }

    const result = await generate(corpus);
    if (!result) {
      await settle(lease, "failed", "digest generator returned no valid result");
      return { status: "failed" };
    }

    const content = {
      headline: result.headline,
      overview: result.overview,
      bullets: result.bullets as Prisma.InputJsonValue,
      themes: result.themes,
      model: result.model,
    };
    const row = await withCoordinationLease(lease, (tx) =>
      tx.digest.upsert({
        where: { date: day },
        create: { date: day, ...content },
        update: { ...content, createdAt: new Date() },
      }),
    );
    await settle(lease, "success");
    return { status: "saved", row };
  } catch (error) {
    await settle(lease, "failed", error);
    throw error;
  } finally {
    await heartbeat.stop();
  }
}

async function settle(
  lease: Extract<CoordinationLeaseClaim, { acquired: true }>,
  status: "success" | "failed",
  error?: unknown,
): Promise<void> {
  try {
    await finishCoordinationLease(lease, status, error);
  } catch (leaseError) {
    console.warn(
      "[digest] lease settlement failed:",
      leaseError instanceof Error ? leaseError.message.slice(0, 300) : "unknown database error",
    );
  }
}
