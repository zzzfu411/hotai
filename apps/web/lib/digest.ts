import { prisma } from "./db";
import { AI_ENABLED, generateDigest, type DigestBullet } from "@hotai/ai";
import { getArticlesSince, getTodayDigestRow, startOfUtcDay } from "./queries";

export type LoadedDigest = {
  headline: string;
  overview: string;
  bullets: DigestBullet[];
  themes: string[];
  model?: string | null;
  createdAt: Date;
};

/**
 * Today's digest: DB hit first (the fetcher refreshes it every ≤6h); when the
 * row doesn't exist yet — e.g. the first visitor of a fresh UTC day before the
 * fetcher's next cycle — generate one on the fly and persist it. This is the
 * one deliberate web-side write to content data.
 */
export async function loadDigest(): Promise<LoadedDigest | null> {
  const today = startOfUtcDay();
  const existing = await getTodayDigestRow();
  if (existing) {
    return {
      headline: existing.headline,
      overview: existing.overview,
      bullets: (existing.bullets as unknown as DigestBullet[]) ?? [],
      themes: existing.themes,
      model: existing.model,
      createdAt: existing.createdAt,
    };
  }

  if (!AI_ENABLED) return null;
  const articles = await getArticlesSince(today, 40);
  if (articles.length < 5) return null;
  const result = await generateDigest(
    articles.map((a) => ({
      id: a.id,
      title: a.title,
      summaryEn: a.aiSummaryEn ?? a.summary ?? null,
      url: a.url,
      sourceName: a.source.name,
      score: a.score,
      topics: a.aiTopics,
    })),
  );
  if (!result) return null;

  const saved = await prisma.digest.upsert({
    where: { date: today },
    create: {
      date: today,
      headline: result.headline,
      overview: result.overview,
      bullets: result.bullets as unknown as object,
      themes: result.themes,
      model: result.model,
    },
    update: {
      headline: result.headline,
      overview: result.overview,
      bullets: result.bullets as unknown as object,
      themes: result.themes,
      model: result.model,
      createdAt: new Date(),
    },
  });
  return {
    headline: result.headline,
    overview: result.overview,
    bullets: result.bullets,
    themes: result.themes,
    model: result.model,
    createdAt: saved.createdAt,
  };
}
