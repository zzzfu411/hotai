import type { Prisma, Source } from "@hotai/db";
import { prisma } from "@hotai/db";
import type { RawItem } from "./types.js";
import { hashTitle, hashUrl, normalizeSafeUrl, normalizeTitle } from "./dedupe.js";
import { computeScore } from "./scoring.js";
import { appendCrossPost, asSignals, mergeSignals } from "./merge.js";
import type { Signals } from "./scoring.js";
import { config } from "./config.js";
import { isRetainablePublishedAt } from "./retention.js";

export type PersistStats = {
  created: number;   // brand-new articles
  refreshed: number; // same URL seen again — signals/score refreshed
  merged: number;    // repost of an existing story, folded into the canonical row
  accepted: number;  // items that passed validation and retention checks
  discarded: number; // invalid, out-of-window, or duplicate items
  discardedInvalid: number;
  discardedOutsideWindow: number;
  discardedDuplicate: number;
  failed: number;
};

export const MAX_ARTICLE_TITLE_LEN = 300;
export const MAX_ARTICLE_SUMMARY_LEN = 600;
export const MAX_ARTICLE_AUTHOR_LEN = 200;
export const MAX_ARTICLE_TAG_LEN = 80;
export const MAX_ARTICLE_RAW_CHARS = 16_000;
const MAX_TAG_INPUTS = 100;

const EXISTING_SELECT = {
  id: true,
  urlHash: true,
  titleHash: true,
  sourceId: true,
  title: true,
  summary: true,
  author: true,
  tags: true,
  raw: true,
  publishedAt: true,
  signals: true,
  crossPosts: true,
  aiSummaryEn: true,
  aiSummaryZh: true,
  aiTopics: true,
  aiSentiment: true,
  aiImportance: true,
  aiAnalyzedAt: true,
  aiModel: true,
  aiStatus: true,
  aiAttempts: true,
  aiNextAttemptAt: true,
  aiLastError: true,
  aiLeaseUntil: true,
  aiPromptVersion: true,
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

export type PreparedBatch = {
  items: PreparedItem[];
  discardedInvalid: number;
  discardedOutsideWindow: number;
  discardedDuplicate: number;
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
  const preparedBatch = prepareItems(items);
  const prepared = preparedBatch.items;
  const stats: PersistStats = {
    created: 0,
    refreshed: 0,
    merged: 0,
    accepted: prepared.length,
    discarded:
      preparedBatch.discardedInvalid +
      preparedBatch.discardedOutsideWindow +
      preparedBatch.discardedDuplicate,
    discardedInvalid: preparedBatch.discardedInvalid,
    discardedOutsideWindow: preparedBatch.discardedOutsideWindow,
    discardedDuplicate: preparedBatch.discardedDuplicate,
    failed: 0,
  };
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
        const oldTitleHash = urlHit.titleHash;
        await refreshExisting(source, p, urlHit);
        if (urlHit.titleHash !== oldTitleHash && byTitle.get(oldTitleHash) === urlHit) {
          byTitle.delete(oldTitleHash);
          if (normalizeTitle(urlHit.title).length >= 8) byTitle.set(urlHit.titleHash, urlHit);
        }
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

/** Validate and bound untrusted adapter output before it reaches Prisma. */
export function prepareItems(items: RawItem[]): PreparedBatch {
  const out = new Map<string, PreparedItem>();
  let discardedInvalid = 0;
  let discardedOutsideWindow = 0;
  let discardedDuplicate = 0;
  for (const it of items) {
    const title = boundedText(it.title, MAX_ARTICLE_TITLE_LEN);
    if (!title || typeof it.url !== "string") {
      discardedInvalid++;
      continue;
    }
    const publishedAtMs = it.publishedAt instanceof Date ? it.publishedAt.getTime() : Number.NaN;
    if (!Number.isFinite(publishedAtMs)) {
      discardedInvalid++;
      continue;
    }
    if (!isRetainablePublishedAt(it.publishedAt)) {
      discardedOutsideWindow++;
      continue;
    }
    const url = normalizeSafeUrl(it.url);
    if (!url) {
      discardedInvalid++;
      continue;
    }
    const urlHash = hashUrl(url);
    const prev = out.get(urlHash);
    if (prev) {
      // Same URL twice in one page — keep the first, merge its signals.
      prev.signals = mergeSignals(prev.signals, it.signals);
      discardedDuplicate++;
      continue;
    }
    const summary = cleanOptional(it.summary, MAX_ARTICLE_SUMMARY_LEN);
    const author = cleanOptional(it.author, MAX_ARTICLE_AUTHOR_LEN);
    out.set(urlHash, {
      url,
      urlHash,
      titleHash: hashTitle(title),
      titleDedupeEligible: normalizeTitle(title).length >= 8,
      title,
      summary,
      author,
      publishedAt: it.publishedAt,
      tags: cleanTags(it.tags),
      signals: asSignals(it.signals),
      raw: cleanRaw(it.raw),
    });
  }
  return {
    items: [...out.values()],
    discardedInvalid,
    discardedOutsideWindow,
    discardedDuplicate,
  };
}

/** Same URL seen again — possibly via a different source (e.g. HN linking a lab blog). */
async function refreshExisting(source: Source, p: PreparedItem, row: ExistingRow): Promise<void> {
  const sameSource = row.sourceId === source.id;
  const previousTitle = row.title;
  const previousSummary = row.summary;
  const signals = mergeSignals(asSignals(row.signals), p.signals);
  const crossPosts = sameSource
    ? undefined
    : appendCrossPost(row.crossPosts, {
        source: source.slug,
        url: p.url,
        publishedAt: p.publishedAt.toISOString(),
      });

  const title = sameSource ? p.title : row.title;
  // A feed can temporarily omit its description. Never erase a useful stored
  // summary with an empty/null refresh; replace it only with a non-empty value.
  const summary = sameSource ? preferSummary(row.summary, p.summary) : row.summary;
  const contentChanged = sameSource && (title !== previousTitle || summary !== previousSummary);
  const aiReset = contentChanged ? resetAiFields() : {};
  const score = computeScore({
    sourceWeight: row.source.weight,
    sourceSlug: row.source.slug,
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
      titleHash: sameSource ? p.titleHash : undefined,
      summary,
      author: sameSource && p.author ? p.author : undefined,
      tags: sameSource ? mergeTags(row.tags, p.tags) : undefined,
      raw: sameSource && p.raw !== undefined ? (p.raw as Prisma.InputJsonValue) : undefined,
      score,
      signals: signals ? (signals as Prisma.InputJsonValue) : undefined,
      crossPosts: crossPosts ? (crossPosts as unknown as Prisma.InputJsonValue) : undefined,
      ...aiReset,
    },
  });

  row.title = title;
  row.titleHash = sameSource ? p.titleHash : row.titleHash;
  row.summary = summary;
  if (sameSource && p.author) row.author = p.author;
  if (sameSource) row.tags = mergeTags(row.tags, p.tags);
  if (sameSource && p.raw !== undefined) row.raw = p.raw as ExistingRow["raw"];
  if (contentChanged) Object.assign(row, resetAiFields());
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
    sourceSlug: row.source.slug,
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
    sourceSlug: source.slug,
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

function boundedText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.length <= maxLength ? trimmed : `${trimmed.slice(0, maxLength - 1)}…`;
}

function cleanOptional(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const bounded = boundedText(value, maxLength);
  return bounded || null;
}

function cleanRaw(value: unknown): unknown {
  if (value === undefined) return undefined;
  try {
    const encoded = JSON.stringify(value);
    return encoded && encoded.length <= MAX_ARTICLE_RAW_CHARS ? value : undefined;
  } catch {
    return undefined;
  }
}

function cleanTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.slice(0, MAX_TAG_INPUTS)
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim().toLowerCase().slice(0, MAX_ARTICLE_TAG_LEN))
    .filter(Boolean))].slice(0, 20);
}

function mergeTags(existing: string[] | undefined, incoming: string[]): string[] {
  return [...new Set(
    [...(existing ?? []).slice(0, MAX_TAG_INPUTS), ...incoming.slice(0, MAX_TAG_INPUTS)]
      .map((tag) => tag.trim().toLowerCase().slice(0, MAX_ARTICLE_TAG_LEN))
      .filter(Boolean),
  )].slice(0, 20);
}

function preferSummary(existing: string | null, incoming: string | null): string | null {
  if (!incoming) return existing;
  if (!existing || incoming.length >= existing.length) return incoming;
  return existing;
}

/** Clear derived fields when an upstream publisher changes the article body. */
function resetAiFields() {
  return {
    aiSummaryEn: null,
    aiSummaryZh: null,
    aiTopics: [],
    aiSentiment: null,
    aiImportance: null,
    aiAnalyzedAt: null,
    aiModel: null,
    aiStatus: "pending",
    aiAttempts: 0,
    aiNextAttemptAt: null,
    aiLastError: null,
    aiLeaseUntil: null,
    aiPromptVersion: null,
  } as const;
}
