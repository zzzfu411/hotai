import { prisma } from "@hotai/db";
import { asSignals } from "./merge.js";
import { computeScore } from "./scoring.js";

const BATCH = 80;
const MIN_DELTA = 0.05;

/**
 * Recompute scores for every live Article. Persist only touches rows seen in
 * this cycle's feeds; everything else would keep a stale decayed score and
 * occupy the hot list after the half-life.
 */
export async function rescoreAllArticles(): Promise<number> {
  const now = new Date();
  const rows = await prisma.article.findMany({
    select: {
      id: true,
      score: true,
      publishedAt: true,
      title: true,
      summary: true,
      signals: true,
      aiImportance: true,
      source: { select: { weight: true } },
    },
  });

  const pending: { id: number; score: number }[] = [];
  for (const row of rows) {
    const next = computeScore({
      sourceWeight: row.source.weight,
      publishedAt: row.publishedAt,
      title: row.title,
      summary: row.summary,
      signals: asSignals(row.signals),
      aiImportance: row.aiImportance,
      now,
    });
    if (Math.abs(next - row.score) >= MIN_DELTA) {
      pending.push({ id: row.id, score: next });
    }
  }

  for (let i = 0; i < pending.length; i += BATCH) {
    const chunk = pending.slice(i, i + BATCH);
    await prisma.$transaction(
      chunk.map((row) =>
        prisma.article.update({ where: { id: row.id }, data: { score: row.score } }),
      ),
    );
  }
  return pending.length;
}
