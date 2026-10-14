"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CATALOG_BY_ID,
  CATALOG_CATEGORIES,
  CATALOG_ITEMS_PER_SOURCE,
  DEFAULT_ENABLED_IDS,
  idsForCategory,
  isCatalogCategoryId,
  type CatalogCategoryId,
} from "@/lib/catalog";
import {
  createNookHistorySnapshot,
  mergeNookHistoryState,
  NOOK_PAGE_SIZE,
  readNookHistorySnapshot,
  visibleCountForAnchor,
  type NookHistorySnapshot,
} from "@/lib/nook-history";
import { readJsonLines } from "@/lib/json-lines";
import { editorialProgressiveLimit, rankHomepageItems } from "@/lib/news-ranking";
import { preserveVisiblePrefix } from "@/lib/progressive-list";
import { safeHttpUrl } from "@/lib/safe-url";
import { displayStory } from "@/lib/story-text";
import { useLang } from "./LangContext";
import { readerLink } from "@/lib/reader-link";
import { ReadingBadge } from "./ReadingList";
import { TimeAgo } from "./TimeAgo";

type RemoteItem = {
  articleId?: number;
  title: string;
  url: string;
  summary: string;
  publishedAt: string | null;
  image: string | null;
};

type TimelineItem = RemoteItem & {
  sourceId: string;
  sourceName: string;
};

type PullSource = {
  id: string;
  name: string;
  ok: boolean;
  items?: unknown;
  error?: string;
  stale?: boolean;
  fetchedAt?: string;
};

type PullSnapshot = {
  at: number;
  items: TimelineItem[];
  okCount: number;
  failCount: number;
  staleCount: number;
  fetchedAt: string | null;
};

type PullError = "rate" | "fail" | "service";

const ENABLED_KEY = "hotai.nook.enabled";
const CLIENT_TTL_MS = 3 * 60 * 1000;
/** Longest the editorial lanes keep the skeleton while waiting for their final order. */
const EDITORIAL_HOLD_MS = 2500;
const MAX_REMOTE_ITEMS = 80;
const MAX_REMOTE_TITLE = 300;
const MAX_REMOTE_SUMMARY = 400;

/** Survives NookFeed remounts (tab switches) within the same JS session. */
const clientPullCache = new Map<string, PullSnapshot>();

function cacheKey(ids: string[]): string {
  return ids.join("\0");
}

function sameIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((id, i) => id === b[i]);
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pullSourceFromEvent(value: unknown): PullSource | null {
  const source = record(record(value)?.source);
  if (
    !source ||
    typeof source.id !== "string" ||
    typeof source.name !== "string" ||
    typeof source.ok !== "boolean"
  ) {
    return null;
  }
  return {
    id: source.id,
    name: source.name,
    ok: source.ok,
    items: source.items,
    error: typeof source.error === "string" ? source.error : undefined,
    stale: source.stale === true,
    fetchedAt: typeof source.fetchedAt === "string" ? source.fetchedAt : undefined,
  };
}

function isDoneEvent(value: unknown): boolean {
  return record(value)?.done === true;
}

function readItems(raw: unknown): RemoteItem[] {
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

function loadEnabled(): string[] {
  if (typeof window === "undefined") return [...DEFAULT_ENABLED_IDS];
  try {
    const raw = window.localStorage.getItem(ENABLED_KEY);
    if (!raw) return [...DEFAULT_ENABLED_IDS];
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [...DEFAULT_ENABLED_IDS];
    const ids = v.filter((id): id is string => typeof id === "string" && CATALOG_BY_ID.has(id));
    return ids.length ? ids : [...DEFAULT_ENABLED_IDS];
  } catch {
    return [...DEFAULT_ENABLED_IDS];
  }
}

function readerHref(item: TimelineItem): string {
  return readerLink({
    ...item,
    source: item.sourceName,
    articleId: item.sourceId === "hotai-feed" ? item.articleId : undefined,
  });
}

function publishedTs(iso: string | null): number {
  if (!iso) return 0;
  const n = Date.parse(iso);
  return Number.isFinite(n) ? n : 0;
}

function isEditorialLane(category: CatalogCategoryId): boolean {
  return category === "mix" || category === "hot";
}

function findNookCard(anchorKey?: string, nearestWhenMissing = true): HTMLElement | null {
  const cards = document.querySelectorAll<HTMLElement>("[data-nook-key]");
  if (anchorKey) {
    for (const card of cards) {
      if (card.dataset.nookKey === anchorKey) return card;
    }
    if (!nearestWhenMissing) return null;
  }

  let nearest: HTMLElement | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const card of cards) {
    const rect = card.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top >= window.innerHeight) continue;
    const distance = Math.abs(rect.top);
    if (distance < nearestDistance) {
      nearest = card;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function mergeSources(
  sources: PullSource[],
  category: CatalogCategoryId,
  complete: boolean,
): Omit<PullSnapshot, "at"> {
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

function sameTimelineItems(a: TimelineItem[], b: TimelineItem[]): boolean {
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

const Cover = memo(function Cover({ src, className }: { src: string; className: string }) {
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={className} src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setOk(false)} />
  );
});

const NookCard = memo(function NookCard({
  item,
  lang,
  lead,
  onOpen,
}: {
  item: TimelineItem;
  lang: "zh" | "en";
  lead?: boolean;
  onOpen: (anchorKey: string) => void;
}) {
  const story = displayStory(item);
  const source = story.publisher ?? item.sourceName;
  return (
    <li className={lead ? "kz-nook-item kz-nook-lead" : "kz-nook-item"} data-nook-key={item.url}>
      <Link
        href={readerHref({ ...item, title: story.title, summary: story.summary, sourceName: source })}
        className="kz-nook-link"
        title={!lead && story.summary ? story.summary : undefined}
        onNavigate={() => onOpen(item.url)}
      >
        <div className="kz-nook-copy">
          <h2 className="kz-nook-item-title">{story.title}</h2>
          <p className="kz-nook-item-meta">
            <span className="kz-source-mark" title={story.publisher ? `${story.publisher} · ${item.sourceName}` : undefined}>
              {source}
            </span>
            <TimeAgo iso={item.publishedAt} lang={lang} />
            <ReadingBadge story={{ ...item, source }} />
          </p>
          {lead && story.summary ? <p className="kz-nook-item-sum">{story.summary}</p> : null}
        </div>
        {item.image ? <Cover src={item.image} className={lead ? "kz-nook-cover" : "kz-nook-thumb"} /> : null}
      </Link>
    </li>
  );
});

export function NookFeed() {
  const { lang } = useLang();
  const zh = lang === "zh";
  const router = useRouter();
  const pathname = usePathname() || "/";
  const params = useSearchParams();
  const rawC = params.get("c");
  const category: CatalogCategoryId = isCatalogCategoryId(rawC) ? rawC : "mix";

  const [enabled, setEnabled] = useState<string[]>([...DEFAULT_ENABLED_IDS]);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [okCount, setOkCount] = useState(0);
  const [failCount, setFailCount] = useState(0);
  const [staleCount, setStaleCount] = useState(0);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [completedCount, setCompletedCount] = useState(0);
  const [shown, setShown] = useState(NOOK_PAGE_SIZE);
  const [epoch, setEpoch] = useState(0);
  const [error, setError] = useState<PullError | null>(null);
  const [suppressCardMotion, setSuppressCardMotion] = useState(false);
  const prevEpoch = useRef(0);
  const previousViewKey = useRef<string | null>(null);
  const pendingRestore = useRef<NookHistorySnapshot | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const next = loadEnabled();
    setEnabled((prev) => (sameIds(prev, next) ? prev : next));
    setReady(true);
  }, []);

  const pullIds = useMemo(() => idsForCategory(category, enabled), [category, enabled]);
  const viewKey = useMemo(() => `${category}:${pullIds.join(",")}`, [category, pullIds]);
  const shownRef = useRef(shown);
  const viewKeyRef = useRef(viewKey);

  useLayoutEffect(() => {
    shownRef.current = shown;
    viewKeyRef.current = viewKey;
  }, [shown, viewKey]);

  const captureProgress = useCallback((anchorKey?: string): NookHistorySnapshot | null => {
    if (typeof window === "undefined") return null;
    if (!document.querySelector("[data-nook-key]")) return null;
    const anchor = findNookCard(anchorKey);
    const rect = anchor?.getBoundingClientRect();
    return createNookHistorySnapshot({
      viewKey: viewKeyRef.current,
      shown: shownRef.current,
      scrollY: window.scrollY,
      anchorKey: anchor?.dataset.nookKey ?? anchorKey ?? null,
      anchorOffset: rect?.top ?? 0,
    });
  }, []);

  const rememberProgress = useCallback((anchorKey?: string) => {
    const snapshot = captureProgress(anchorKey);
    if (!snapshot) return;
    try {
      window.history.replaceState(
        mergeNookHistoryState(window.history.state, snapshot),
        "",
        window.location.href,
      );
    } catch {
      // History state can be unavailable in locked-down/private contexts.
    }
  }, [captureProgress]);

  useEffect(() => {
    if (!ready) return;
    const key = cacheKey(pullIds);
    const force = epoch !== prevEpoch.current;
    prevEpoch.current = epoch;
    const viewChanged = previousViewKey.current !== viewKey;
    previousViewKey.current = viewKey;
    let restored: NookHistorySnapshot | null = null;
    if (viewChanged) {
      restored = readNookHistorySnapshot(window.history.state, viewKey);
      pendingRestore.current = restored;
      setSuppressCardMotion(Boolean(restored));
      setShown(restored?.shown ?? NOOK_PAGE_SIZE);
    }
    const cached = clientPullCache.get(key);
    // A browser-history return should first recreate the exact list the user
    // left. Reordering it immediately because the 3-minute TTL elapsed would
    // defeat anchor restoration; the explicit refresh control remains available.
    const fresh = Boolean(
      cached && !force && (Date.now() - cached.at < CLIENT_TTL_MS || restored),
    );

    if (cached) {
      setItems(cached.items);
      setOkCount(cached.okCount);
      setFailCount(cached.failCount);
      setStaleCount(cached.staleCount);
      setFetchedAt(cached.fetchedAt);
      setError(null);
    } else {
      setItems([]);
      setOkCount(0);
      setFailCount(0);
      setStaleCount(0);
      setFetchedAt(null);
      setError(null);
    }
    setCompletedCount(fresh ? pullIds.length : 0);
    if (fresh) {
      setLoading(false);
      return;
    }

    const ac = new AbortController();
    const received = new Map<string, PullSource>();
    const allowedIds = new Set(pullIds);
    const keepCachedDuringStream = Boolean(cached?.items.length);
    const editorialLane = isEditorialLane(category);
    const editorialSettleSourceCount = Math.min(8, pullIds.length);
    let committedItems = cached?.items ?? [];
    let editorialSettled = keepCachedDuringStream || !editorialLane;
    let holdExpired = false;
    let streamDone = false;
    let serviceDegraded = false;

    const mergeReceived = (complete: boolean) => {
      const ordered = pullIds
        .map((id) => received.get(id))
        .filter((source): source is PullSource => Boolean(source));
      const merged = mergeSources(ordered, category, complete);
      return merged;
    };

    const publish = (
      snapshot: Omit<PullSnapshot, "at">,
      allowVisibleRerank = false,
    ) => {
      const nextItems = allowVisibleRerank
        ? snapshot.items
        : preserveVisiblePrefix(
            committedItems,
            snapshot.items,
            shownRef.current,
            (item) => item.url,
          );
      if (!sameTimelineItems(committedItems, nextItems)) {
        const stableVisibleCount = Math.min(committedItems.length, shownRef.current);
        const visibleCardsChanged = !sameTimelineItems(
          committedItems.slice(0, stableVisibleCount),
          nextItems.slice(0, stableVisibleCount),
        );
        // Only hold a card in place for someone already reading inside the
        // list. At the top of the page the reranked list should simply render
        // where it is; anchoring there scrolled first-time visitors ~350px
        // down while sources were still streaming in.
        const readingInsideList = (listRef.current?.getBoundingClientRect().top ?? 1) < 0;
        const continuity = !force && visibleCardsChanged && !pendingRestore.current && readingInsideList
          ? captureProgress()
          : null;
        if (continuity) {
          pendingRestore.current = continuity;
          setSuppressCardMotion(true);
        }
        committedItems = nextItems;
        setItems(nextItems);
      }
      publishStatus(snapshot);
    };

    const publishStatus = (snapshot: Omit<PullSnapshot, "at">) => {
      setOkCount(snapshot.okCount);
      setFailCount(snapshot.failCount);
      setStaleCount(snapshot.staleCount);
      setFetchedAt(snapshot.fetchedAt);
      setError(null);
    };

    // The editorial lanes (综合/要闻) rank across sources, so early arrivals
    // would reorder stories already on screen as later sources land. Keep the
    // skeleton until the ranking has enough sources, then render once in its
    // final order; afterwards only stories below the visible page can move.
    const settleEditorial = () => {
      editorialSettled = true;
      if (received.size > 0) publish(mergeReceived(false), true);
    };
    const holdTimer = editorialSettled
      ? undefined
      : window.setTimeout(() => {
          holdExpired = true;
          if (!editorialSettled && !ac.signal.aborted && received.size > 0) settleEditorial();
        }, EDITORIAL_HOLD_MS);

    setLoading(true);

    (async () => {
      try {
        const res = await fetch("/api/catalog/pull", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: pullIds, stream: true }),
          signal: ac.signal,
        });
        if (ac.signal.aborted) return;
        if (!res.ok) {
          setError(res.status === 429 ? "rate" : res.status === 503 ? "service" : "fail");
          if (keepCachedDuringStream) { setStaleCount(pullIds.length); setOkCount(0); }
          return;
        }
        if (!res.body) throw new Error("catalog stream unavailable");

        await readJsonLines(res.body, (value) => {
          if (isDoneEvent(value)) {
            streamDone = true;
            serviceDegraded = record(value)?.degraded === "service";
            return;
          }
          const source = pullSourceFromEvent(value);
          if (!source || !allowedIds.has(source.id)) return;
          received.set(source.id, source);
          setCompletedCount(received.size);
          if (!keepCachedDuringStream) {
            const partial = mergeReceived(false);
            if (editorialSettled) {
              publish(partial);
              return;
            }
            const hasEditorialAnchor = ["gnews-top", "bbc-zh", "dw-zh"].some(
              (id) => received.get(id)?.ok,
            );
            if (holdExpired || (partial.okCount >= editorialSettleSourceCount && hasEditorialAnchor)) {
              settleEditorial();
            } else {
              publishStatus(partial);
            }
          }
        });
        window.clearTimeout(holdTimer);
        if (!streamDone) throw new Error("catalog stream ended early");

        const complete = mergeReceived(true);
        if (complete.items.length === 0 && keepCachedDuringStream && complete.failCount > 0) {
          setOkCount(0);
          setStaleCount(pullIds.length);
          setFailCount(complete.failCount);
          setError("fail");
          return;
        }
        publish(complete, force || (editorialLane && !editorialSettled));
        if (serviceDegraded) setError("service");
        if (force) { pendingRestore.current = null; setShown(NOOK_PAGE_SIZE); }
        editorialSettled = true;
        setCompletedCount(pullIds.length);
        const snap = { at: Date.now(), ...complete, items: committedItems };
        clientPullCache.set(key, snap);
      } catch (err) {
        window.clearTimeout(holdTimer);
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (!ac.signal.aborted) {
          if (!keepCachedDuringStream) publish(mergeReceived(true), editorialLane && !editorialSettled);
          else { setStaleCount(pullIds.length); setOkCount(0); }
          setError("fail");
        }
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();

    return () => {
      window.clearTimeout(holdTimer);
      ac.abort();
    };
  }, [ready, pullIds, viewKey, category, epoch, captureProgress]);

  useLayoutEffect(() => {
    const snapshot = pendingRestore.current;
    if (!snapshot || snapshot.viewKey !== viewKey || items.length === 0) return;

    if (snapshot.anchorKey) {
      const anchorIndex = items.findIndex((item) => item.url === snapshot.anchorKey);
      if (anchorIndex < 0 && loading) return;
      const expanded = visibleCountForAnchor(shown, anchorIndex, items.length);
      if (expanded > shown) {
        setShown(expanded);
        return;
      }
    } else if (loading) {
      return;
    }

    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        if (pendingRestore.current !== snapshot) return;
        const anchor = snapshot.anchorKey ? findNookCard(snapshot.anchorKey, false) : null;
        const target = anchor
          ? window.scrollY + anchor.getBoundingClientRect().top - snapshot.anchorOffset
          : snapshot.scrollY;
        window.scrollTo({ top: Math.max(0, target), left: 0, behavior: "auto" });
        pendingRestore.current = null;
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [items, shown, viewKey, loading]);

  const setCategory = useCallback(
    (id: CatalogCategoryId) => {
      rememberProgress();
      const next = new URLSearchParams(params.toString());
      if (id === "mix") next.delete("c");
      else next.set("c", id);
      const q = next.toString();
      // Channel changes are navigations: keep them in browser history so Back
      // returns to the previous lane instead of silently skipping it.
      router.push(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [params, pathname, rememberProgress, router],
  );

  const visible = items.slice(0, shown);
  const catMeta = CATALOG_CATEGORIES.find((c) => c.id === category);
  const errorText =
    error === "rate"
      ? zh
        ? "刷新太勤，等一会儿。"
        : "Slow down a moment."
      : error === "service"
        ? zh ? "更新服务暂时不可用，请稍后重试。" : "The update service is unavailable. Try again shortly."
      : error === "fail"
        ? zh
          ? "时间线拉取失败。"
          : "Failed to load the timeline."
        : null;
  const emptyTitle = failCount
    ? zh
      ? "信号源暂不可用"
      : "Signal sources are offline"
    : zh
      ? "这一栏还没有条目"
      : "Nothing in this lane yet";
  const emptyCopy = failCount
    ? zh
      ? "编辑部暂时收不到来源，稍后再试一次。"
      : "The desk could not reach its sources. Try a refresh in a moment."
    : zh
      ? "新的条目会在来源同步后出现在这里。"
      : "New signals will appear here after the sources sync.";

  return (
    <div className={suppressCardMotion ? "kz-nook kz-nook-continuity" : "kz-nook"} aria-busy={loading}>
      <h1 className="sr-only">
        {zh ? `速闻 · ${catMeta?.labelZh ?? "综合"}` : `Feed · ${catMeta?.labelEn ?? "Mix"}`}
      </h1>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {loading
          ? zh
            ? "正在同步"
            : "Syncing"
          : zh
            ? `${items.length} 条，${okCount} 个来源在线${failCount ? `，${failCount} 个来源异常` : ""}`
            : `${items.length} stories, ${okCount} sources online${failCount ? `, ${failCount} offline` : ""}`}
      </p>

      <div className="kz-nook-bar">
        <nav className="kz-nook-chips" aria-label={zh ? "频道" : "Channels"}>
          {CATALOG_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className={c.id === category ? "kz-channel active" : "kz-channel"}
              onClick={() => setCategory(c.id)}
              aria-pressed={c.id === category}
            >
              {zh ? c.labelZh : c.labelEn}
            </button>
          ))}
        </nav>
        <div className="kz-nook-status" aria-label={zh ? "时间线状态" : "Timeline status"}>
          <span className={loading ? "kz-live-dot is-syncing" : failCount ? "kz-live-dot is-warn" : "kz-live-dot"} aria-hidden />
          <span className="kz-status-stat">
            <strong>{okCount}</strong> {zh ? "源" : "live"}
          </span>
          <span className="kz-status-stat">
            <strong>{items.length}</strong> {zh ? "条" : "stories"}
          </span>
          {failCount ? (
            <span className="kz-status-stat kz-status-alert">
              <strong>{failCount}</strong> {zh ? "异常" : "offline"}
            </span>
          ) : null}
          <button
            type="button"
            className="kz-btn kz-btn-sm kz-btn-ghost kz-refresh-btn"
            onClick={() => setEpoch((n) => n + 1)}
            disabled={loading}
          >
            <span className={loading ? "kz-refresh-icon is-spinning" : "kz-refresh-icon"} aria-hidden>↻</span>
            <span className="kz-refresh-label">{loading ? (zh ? "同步中" : "Syncing") : zh ? "刷新" : "Refresh"}</span>
          </button>
        </div>
      </div>

      {errorText ? <p className="kz-nook-error" role="status">{errorText}</p> : null}
      {(staleCount > 0 || (error && items.length > 0)) ? (
        <p className="kz-nook-meta" role="status">
          {zh ? "显示上次缓存的内容" : "Showing previously cached stories"}
          {fetchedAt ? ` · ${new Date(fetchedAt).toLocaleString(zh ? "zh-CN" : "en-GB")}` : ""}
          {staleCount ? (zh ? ` · ${staleCount} 个缓存源` : ` · ${staleCount} cached sources`) : ""}
        </p>
      ) : null}

      {loading && items.length === 0 ? (
        <div className="kz-nook-list" aria-hidden>
          <div className="kz-nook-skel kz-nook-lead" />
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="kz-nook-skel" />
          ))}
        </div>
      ) : null}

      <ul className="kz-nook-list" ref={listRef}>
        {visible.map((it, i) => (
          <NookCard
            key={`${it.sourceId}:${it.url}`}
            item={it}
            lang={lang}
            lead={i === 0}
            onOpen={rememberProgress}
          />
        ))}
      </ul>

      {!loading && items.length === 0 && !error ? (
        <div className="kz-card kz-feed-empty">
          <p className="kz-feed-empty-title">{emptyTitle}</p>
          <p className="kz-feed-empty-copy">{emptyCopy}</p>
          {failCount ? (
            <button type="button" className="kz-btn kz-btn-sm" onClick={() => setEpoch((n) => n + 1)}>
              {zh ? "重新连接" : "Reconnect"}
            </button>
          ) : null}
        </div>
      ) : null}

      {shown < items.length ? (
        <div className="kz-nook-more">
          <button type="button" className="kz-btn kz-btn-wide" onClick={() => setShown((n) => n + NOOK_PAGE_SIZE)}>
            {zh ? "加载更多" : "Load more"}
          </button>
          <span className="kz-nook-progress">
            {Math.min(shown, items.length)} / {items.length}
          </span>
        </div>
      ) : null}
      {loading && items.length > 0 ? (
        <p className="kz-nook-meta kz-nook-meta-center" role="status">
          {zh
            ? `后续来源同步中 · ${completedCount}/${pullIds.length}`
            : `Syncing more sources · ${completedCount}/${pullIds.length}`}
        </p>
      ) : null}
    </div>
  );
}
