import { CATALOG_BY_ID, CATALOG_ITEMS_PER_SOURCE, type CatalogCategoryId } from "./catalog";
import { NOOK_PAGE_SIZE } from "./nook-history";
import { editorialProgressiveLimit, rankHomepageItems } from "./news-ranking";
import { safeHttpUrl } from "./safe-url";

/**
 * Pure merge step of the live timeline, shared by the browser (streamed
 * /api/catalog/pull results) and the server (the first screen rendered from
 * the in-memory feed cache).
 */

export type RemoteItem = {
  articleId?: number;
  title: string;
  url: string;
  summary: string;
  publishedAt: string | null;
  image: string | null;
};

export type TimelineItem = RemoteItem & {
  sourceId: string;
  sourceName: string;
};

export type PullSource = {
  id: string;
  name: string;
  ok: boolean;
  items?: unknown;
  error?: string;
  stale?: boolean;
  fetchedAt?: string;
};

export type MergedTimeline = {
  items: TimelineItem[];
  okCount: number;
  failCount: number;
  staleCount: number;
  fetchedAt: string | null;
};

const MAX_REMOTE_ITEMS = 80;
const MAX_REMOTE_TITLE = 300;
const MAX_REMOTE_SUMMARY = 400;

/** Sources whose arrival lets the editorial lanes settle on a final order. */
export const EDITORIAL_ANCHOR_IDS: readonly string[] = ["gnews-top", "bbc-zh", "dw-zh"];

export function isEditorialLane(category: CatalogCategoryId): boolean {
  return category === "mix" || category === "hot";
}

/** Editorial lanes hold their skeleton until this many sources have answered. */
export function editorialSettleSourceCount(pullIdCount: number): number {
  return Math.min(8, pullIdCount);
}

export function readItems(raw: unknown): RemoteItem[] {
  if (!Array.isArray(raw)) return [];
  const out: RemoteItem[] = [];
  for (const item of raw.slice(0, MAX_REMOTE_ITEMS)) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const title = typeof rec.title === "string" ? rec.title.trim().slice(0, MAX_REMOTE_TITLE) : "";
    const url = safeHttpUrl(typeof rec.url === "string" ? rec.url : null) ?? "";
    if (!title || !url) continue;
    const image = safeHttpUrl(typeof rec.image === "string" ? rec.image : null);
    out.push({
      articleId: typeof rec.articleId === "number" && Number.isInteger(rec.articleId) && rec.articleId > 0 ? rec.articleId : undefined,
      title,
      url,
      summary: typeof rec.summary === "string" ? rec.summary.slice(0, MAX_REMOTE_SUMMARY) : "",
      publishedAt: typeof rec.publishedAt === "string" ? rec.publishedAt : null,
      image,
    });
  }
  return out;
}

function publishedTs(iso: string | null): number {
  if (!iso) return 0;
  const n = Date.parse(iso);
  return Number.isFinite(n) ? n : 0;
}

export function mergeSources(
  sources: PullSource[],
  category: CatalogCategoryId,
  complete: boolean,
): MergedTimeline {
  const merged: TimelineItem[] = [];
  const seen = new Set<string>();
  let ok = 0;
  let fail = 0;
  let stale = 0;
  let oldest: string | null = null;
  for (const src of sources) {
    if (!src.ok) {
      if (src.error !== "service unavailable") fail++;
      continue;
    }
    if (src.stale) stale++;
    else ok++;
    if (src.fetchedAt && Number.isFinite(Date.parse(src.fetchedAt)) &&
        (!oldest || Date.parse(src.fetchedAt) < Date.parse(oldest))) oldest = src.fetchedAt;
    const name = src.name || CATALOG_BY_ID.get(src.id)?.name || src.id;
    for (const it of readItems(src.items)) {
      const key = it.url.replace(/#.*$/, "");
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({ ...it, sourceId: src.id, sourceName: name });
    }
  }
  if (isEditorialLane(category)) {
    const ranked = rankHomepageItems(merged, { pageSize: NOOK_PAGE_SIZE });
    merged.splice(0, merged.length, ...ranked);
    if (!complete) {
      merged.splice(
        editorialProgressiveLimit(ok + stale, NOOK_PAGE_SIZE, CATALOG_ITEMS_PER_SOURCE),
      );
    }
  } else {
    merged.sort((a, b) => publishedTs(b.publishedAt) - publishedTs(a.publishedAt));
  }
  return { items: merged, okCount: ok, failCount: fail, staleCount: stale, fetchedAt: oldest };
}

/** Same stories in the same order, as far as a rendered row can tell. */
export function sameTimelineItems(a: TimelineItem[], b: TimelineItem[]): boolean {
  return a.length === b.length && a.every((item, index) => {
    const next = b[index];
    return Boolean(
      next &&
      item.url === next.url &&
      item.title === next.title &&
      item.summary === next.summary &&
      item.publishedAt === next.publishedAt &&
      item.image === next.image &&
      item.sourceId === next.sourceId &&
      item.sourceName === next.sourceName
    );
  });
}
