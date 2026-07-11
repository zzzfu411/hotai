import type { Prisma, Source } from "@hotai/db";
import { prisma } from "@hotai/db";
import type { RawItem } from "./types.js";
import { hashTitle, hashUrl, normalizeTitle, normalizeUrl } from "./dedupe.js";
import { computeScore } from "./scoring.js";
import { appendCrossPost, asSignals, mergeSignals } from "./merge.js";
import type { Signals } from "./scoring.js";
import { config } from "./config.js";

export type PersistStats = {
  created: number;   // brand-new articles
  refreshed: number; // same URL seen again — signals/score refreshed
  merged: number;    // repost of an existing story, folded into the canonical row
  failed: number;
};

const EXISTING_SELECT = {
  id: true,
  urlHash: true,
  titleHash: true,
  sourceId: true,
  title: true,
  summary: true,
  publishedAt: true,
  signals: true,
  crossPosts: true,
  aiImportance: true,
  source: { select: { slug: true, weight: true } },
} satisfies Prisma.ArticleSelect;

type ExistingRow = Prisma.ArticleGetPayload<{ select: typeof EXISTING_SELECT }>;

type PreparedItem = {
  url: string;
  urlHash: string;
  titleHash: string;
  // Very short/generic normalized titles ("weekly thread") would mass-merge
  // unrelated items — those rows keep their titleHash but never title-merge.
  titleDedupeEligible: boolean;
  title: string;
  summary: string | null;
  author: string | null;
  publishedAt: Date;
  tags: string[];
  signals?: Signals;
  raw?: unknown;
};

/**
 * Persist one source's fetched items. Dedupe ladder, per item:
 *   1. urlHash hit           → refresh: merge signals, recompute score
 *   2. recent titleHash hit  → repost: merge signals + record crossPost on the
 *                              canonical row; no new row is created
 *   3. otherwise             → create
 *
 * Scores are recomputed on every touch (decay + fresh signals + the row's
 * aiImportance if it has been enriched), so re-running the fetcher re-ranks
 * even when nothing new arrived.
 */
export async function persistItems(source: Source, items: RawItem[]): Promise<PersistStats> {
  const stats: PersistStats = { created: 0, refreshed: 0, merged: 0, failed: 0 };
  const prepared = prepare(items);
  if (prepared.length === 0) return stats;

  const windowStart = new Date(Date.now() - config.titleDedupeWindowDays * 24 * 3600 * 1000);
  const titleHashes = [...new Set(prepared.filter((p) => p.titleDedupeEligible).map((p) => p.titleHash))];
  const [byUrlRows, byTitleRows] = await Promise.all([
    prisma.article.findMany({
      where: { urlHash: { in: [...new Set(prepared.map((p) => p.urlHash))] } },
      select: EXISTING_SELECT,
    }),
    titleHashes.length > 0
      ? prisma.article.findMany({
          where: { titleHash: { in: titleHashes }, publishedAt: { gte: windowStart } },
          orderBy: { publishedAt: "asc" }, // earliest report is the canonical row
          select: EXISTING_SELECT,
        })
      : Promise.resolve([] as ExistingRow[]),
  ]);

  const byUrl = new Map(byUrlRows.map((r) => [r.urlHash, r]));
  const byTitle = new Map<string, ExistingRow>();
  for (const r of byTitleRows) if (!byTitle.has(r.titleHash)) byTitle.set(r.titleHash, r);

  for (const p of prepared) {
    try {
      const urlHit = byUrl.get(p.urlHash);
      if (urlHit) {
        await refreshExisting(source, p, urlHit);
        if (urlHit.sourceId === source.id) stats.refreshed++;
        else stats.merged++;
        continue;
      }
      const titleHit = p.titleDedupeEligible ? byTitle.get(p.titleHash) : undefined;
      if (titleHit) {
        await mergeRepost(source, p, titleHit);
        stats.merged++;
        continue;
      }
      const row = await createArticle(source, p);
      byUrl.set(row.urlHash, row);
      if (p.titleDedupeEligible && !byTitle.has(row.titleHash)) byTitle.set(row.titleHash, row);
      stats.created++;
    } catch (err) {
      stats.failed++;
      console.warn(`    persist failed for ${p.url}:`, (err as Error).message);
    }
  }
  return stats;
}

function prepare(items: RawItem[]): PreparedItem[] {
  const out = new Map<string, PreparedItem>();
  for (const it of items) {
    if (!it.title || !it.url) continue;
    const url = normalizeUrl(it.url);
    const urlHash = hashUrl(url);
    const prev = out.get(urlHash);
    if (prev) {
      // Same URL twice in one page — keep the first, merge its signals.
      prev.signals = mergeSignals(prev.signals, it.signals);
      continue;
    }
    const title = it.title.trim();
    out.set(urlHash, {
      url,
      urlHash,
      titleHash: hashTitle(title),
      titleDedupeEligible: normalizeTitle(title).length >= 8,
      title,
      summary: it.summary ?? null,
      author: it.author ?? null,
      publishedAt: it.publishedAt,
      tags: it.tags ?? [],
      signals: it.signals,
      raw: it.raw,
    });
  }
  return [...out.values()];
}

/** Same URL seen again — possibly via a different source (e.g. HN linking a lab blog). */
async function refreshExisting(source: Source, p: PreparedItem, row: ExistingRow): Promise<void> {
  const sameSource = row.sourceId === source.id;
  const signals = mergeSignals(asSignals(row.signals), p.signals);
  const crossPosts = sameSource
    ? undefined
    : appendCrossPost(row.crossPosts, {
        source: source.slug,
        url: p.url,
        publishedAt: p.publishedAt.toISOString(),
      });

  const title = sameSource ? p.title : row.title;
  const summary = sameSource ? p.summary : row.summary;
  const score = computeScore({
    sourceWeight: row.source.weight,
    publishedAt: row.publishedAt,
    title,
    summary,
    signals,
    aiImportance: row.aiImportance,
  });

  await prisma.article.update({
    where: { id: row.id },
    data: {
      title,
      summary,
      score,
      signals: signals ? (signals as Prisma.InputJsonValue) : undefined,
      crossPosts: crossPosts ? (crossPosts as unknown as Prisma.InputJsonValue) : undefined,
    },
  });

  row.title = title;
  row.summary = summary;
  row.signals = (signals ?? row.signals) as ExistingRow["signals"];
  if (crossPosts) row.crossPosts = crossPosts as ExistingRow["crossPosts"];
}

/** New URL, but a recent article already tells this story — fold into it. */
async function mergeRepost(source: Source, p: PreparedItem, row: ExistingRow): Promise<void> {
  const signals = mergeSignals(asSignals(row.signals), p.signals);
  const crossPosts = appendCrossPost(row.crossPosts, {
    source: source.slug,
    url: p.url,
    publishedAt: p.publishedAt.toISOString(),
  });
  const score = computeScore({
    sourceWeight: row.source.weight,
    publishedAt: row.publishedAt,
    title: row.title,
    summary: row.summary,
    signals,
    aiImportance: row.aiImportance,
  });

  await prisma.article.update({
    where: { id: row.id },
    data: {
      score,
      signals: signals ? (signals as Prisma.InputJsonValue) : undefined,
      crossPosts: crossPosts as unknown as Prisma.InputJsonValue,
    },
  });

  row.signals = (signals ?? row.signals) as ExistingRow["signals"];
  row.crossPosts = crossPosts as ExistingRow["crossPosts"];
}

async function createArticle(source: Source, p: PreparedItem): Promise<ExistingRow> {
  const score = computeScore({
    sourceWeight: source.weight,
    publishedAt: p.publishedAt,
    title: p.title,
    summary: p.summary,
    signals: p.signals,
  });
  return prisma.article.create({
    data: {
      sourceId: source.id,
      url: p.url,
      urlHash: p.urlHash,
      title: p.title,
      titleHash: p.titleHash,
      summary: p.summary,
      author: p.author,
      publishedAt: p.publishedAt,
      lang: source.lang,
      category: source.category,
      tags: p.tags,
      score,
      signals: p.signals ? (p.signals as Prisma.InputJsonValue) : undefined,
      raw: p.raw !== undefined ? (p.raw as Prisma.InputJsonValue) : undefined,
    },
    select: EXISTING_SELECT,
  });
}
