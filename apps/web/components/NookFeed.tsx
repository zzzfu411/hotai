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
import { timeAgo } from "@/lib/format";
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
import { useLang } from "./LangContext";

type RemoteItem = {
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
};

type PullSnapshot = {
  at: number;
  items: TimelineItem[];
  okCount: number;
  failCount: number;
};

type PullError = "rate" | "fail";

const ENABLED_KEY = "hotai.nook.enabled";
const CLIENT_TTL_MS = 3 * 60 * 1000;
const MAX_REMOTE_ITEMS = 80;
const MAX_REMOTE_TITLE = 300;
const MAX_REMOTE_SUMMARY = 400;

const CATEGORY_DECK: Record<CatalogCategoryId, { zh: string; en: string }> = {
  mix: { zh: "跨来源实时混排，用最短路径看见今天正在发生什么。", en: "A live cross-source desk for what is moving right now." },
  hot: { zh: "把主流媒体的共同头条压缩成一张快速浏览的版面。", en: "The shared front page across major newsrooms." },
  tech: { zh: "产品、工程、平台与互联网文化的前沿信号。", en: "Products, engineering, platforms and internet culture." },
  biz: { zh: "公司、资本、产业变化，以及技术背后的商业动向。", en: "Companies, capital and the business underneath technology." },
  intl: { zh: "来自不同地区与编辑部的国际新闻交叉视角。", en: "World news seen across regions and editorial desks." },
  science: { zh: "研究发现、科学突破与那些值得慢一点读的故事。", en: "Research, discovery and stories worth reading more slowly." },
  ai: { zh: "模型、产品、论文与社区讨论组成的 AI 实时信号。", en: "Models, products, papers and the live AI conversation." },
  ent: { zh: "文化、娱乐与互联网流行现场。", en: "Culture, entertainment and the internet's current mood." },
  sports: { zh: "赛事、人物与体育世界的即时更新。", en: "Live updates from sport, competition and its people." },
};

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
  if (item.sourceId === "juya-daily") {
    const d = /(\d{4}-\d{2}-\d{2})/.exec(item.title)?.[1];
    if (d) return `/juya?date=${d}`;
  }
  const q = new URLSearchParams();
  q.set("url", item.url);
  q.set("title", item.title);
  if (item.summary) q.set("summary", item.summary);
  q.set("src", item.sourceId);
  return `/r?${q.toString()}`;
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
  for (const src of sources) {
    if (!src.ok) {
      fail++;
      continue;
    }
    ok++;
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
        editorialProgressiveLimit(ok, NOOK_PAGE_SIZE, CATALOG_ITEMS_PER_SOURCE),
      );
    }
  } else {
    merged.sort((a, b) => publishedTs(b.publishedAt) - publishedTs(a.publishedAt));
  }
  return { items: merged, okCount: ok, failCount: fail };
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

const Cover = memo(function Cover({ src, alt }: { src: string; alt: string }) {
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="kz-nook-cover" src={src} alt={alt} loading="lazy" onError={() => setOk(false)} />
  );
});

const NookCard = memo(function NookCard({
  item,
  lang,
  index,
  featured,
  onOpen,
}: {
  item: TimelineItem;
  lang: "zh" | "en";
  index: number;
  featured?: boolean;
  onOpen: (anchorKey: string) => void;
}) {
  const when = item.publishedAt ? new Date(item.publishedAt) : null;
  return (
    <li
      className={featured ? "kz-card kz-nook-item kz-nook-item-featured" : "kz-card kz-nook-item"}
      data-nook-key={item.url}
    >
      <Link
        href={readerHref(item)}
        className="kz-nook-link"
        onNavigate={() => onOpen(item.url)}
      >
        {item.image ? <Cover src={item.image} alt="" /> : null}
        <div className="kz-nook-copy">
          <p className="kz-nook-item-meta">
            <span className="kz-source-mark">{item.sourceName}</span>
            {when && Number.isFinite(when.getTime()) ? (
              <time dateTime={item.publishedAt ?? undefined}>{timeAgo(when, lang)}</time>
            ) : null}
            <span className="kz-story-index" aria-hidden>
              /{index.toString().padStart(2, "0")}
            </span>
          </p>
          <h2 className="kz-nook-item-title">{item.title}</h2>
          {item.summary ? (
            <p className={item.image ? "kz-nook-item-sum kz-nook-item-sum-tight" : "kz-nook-item-sum"}>
              {item.summary}
            </p>
          ) : null}
        </div>
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
  const [completedCount, setCompletedCount] = useState(0);
  const [shown, setShown] = useState(NOOK_PAGE_SIZE);
  const [epoch, setEpoch] = useState(0);
  const [error, setError] = useState<PullError | null>(null);
  const [suppressCardMotion, setSuppressCardMotion] = useState(false);
  const prevEpoch = useRef(0);
  const previousViewKey = useRef<string | null>(null);
  const pendingRestore = useRef<NookHistorySnapshot | null>(null);

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
      setError(null);
    } else {
      setItems([]);
      setOkCount(0);
      setFailCount(0);
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
    let streamDone = false;

    const mergeReceived = (complete: boolean) => {
      const ordered = pullIds
        .map((id) => received.get(id))
        .filter((source): source is PullSource => Boolean(source));
      const merged = mergeSources(ordered, category, complete);
      if (complete) merged.failCount += pullIds.length - received.size;
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
        const continuity = visibleCardsChanged && !pendingRestore.current
          ? captureProgress()
          : null;
        if (continuity) {
          pendingRestore.current = continuity;
          setSuppressCardMotion(true);
        }
        committedItems = nextItems;
        setItems(nextItems);
      }
      setOkCount(snapshot.okCount);
      setFailCount(snapshot.failCount);
      setError(null);
    };

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
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          if (!keepCachedDuringStream) {
            setItems([]);
            setOkCount(0);
            setFailCount(pullIds.length);
            setError(data?.error === "rate limited" ? "rate" : "fail");
          }
          return;
        }
        if (!res.body) throw new Error("catalog stream unavailable");

        await readJsonLines(res.body, (value) => {
          if (isDoneEvent(value)) {
            streamDone = true;
            return;
          }
          const source = pullSourceFromEvent(value);
          if (!source || !allowedIds.has(source.id)) return;
          received.set(source.id, source);
          setCompletedCount(received.size);
          if (!keepCachedDuringStream) {
            const partial = mergeReceived(false);
            const allowVisibleRerank = editorialLane && !editorialSettled;
            publish(partial, allowVisibleRerank);
            const hasEditorialAnchor = ["gnews-top", "bbc-zh", "dw-zh"].some(
              (id) => received.get(id)?.ok,
            );
            if (
              partial.okCount >= editorialSettleSourceCount &&
              hasEditorialAnchor
            ) {
              editorialSettled = true;
            }
          }
        });
        if (!streamDone) throw new Error("catalog stream ended early");

        const complete = mergeReceived(true);
        publish(complete, editorialLane && !editorialSettled);
        editorialSettled = true;
        setCompletedCount(pullIds.length);
        const snap = { at: Date.now(), ...complete, items: committedItems };
        clientPullCache.set(key, snap);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (!ac.signal.aborted && !keepCachedDuringStream) {
          const partial = mergeReceived(true);
          publish(partial, editorialLane && !editorialSettled);
          if (partial.items.length === 0) setError("fail");
        }
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();

    return () => ac.abort();
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
  const categoryDeck = CATEGORY_DECK[category];
  const errorText =
    error === "rate"
      ? zh
        ? "刷新太勤，等一会儿。"
        : "Slow down a moment."
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
      <header className="kz-nook-head">
        <div className="kz-nook-title-block">
          <p className="kz-signal-eyebrow">
            <span className="kz-live-dot" aria-hidden />
            {zh ? "LIVE · AI 信号编辑部" : "LIVE · AI SIGNAL DESK"}
          </p>
          <h1 className="kz-feed-title">
            <span aria-hidden>00/</span>
            {zh ? catMeta?.labelZh ?? "综合" : catMeta?.labelEn ?? "Mix"}
          </h1>
          <p className="kz-nook-deck">{zh ? categoryDeck.zh : categoryDeck.en}</p>
        </div>
        <div className="kz-nook-console" aria-label={zh ? "时间线状态" : "Timeline status"}>
          <div className="kz-console-stat">
            <strong>{okCount.toString().padStart(2, "0")}</strong>
            <span>{zh ? "在线源" : "sources"}</span>
          </div>
          <div className="kz-console-stat">
            <strong>{items.length.toString().padStart(2, "0")}</strong>
            <span>{zh ? "条信号" : "signals"}</span>
          </div>
          <div className={failCount ? "kz-console-stat kz-console-stat-alert" : "kz-console-stat"}>
            <strong>{failCount.toString().padStart(2, "0")}</strong>
            <span>{zh ? "异常" : "offline"}</span>
          </div>
          <button
            type="button"
            className="kz-btn kz-refresh-btn"
            onClick={() => setEpoch((n) => n + 1)}
            disabled={loading}
          >
            <span className={loading ? "kz-refresh-icon is-spinning" : "kz-refresh-icon"} aria-hidden>↻</span>
            {loading ? (zh ? "同步中" : "Syncing") : zh ? "刷新信号" : "Refresh"}
          </button>
        </div>
      </header>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {loading
          ? zh
            ? "正在同步信号"
            : "Syncing signals"
          : zh
            ? `${items.length} 条信号，${okCount} 个来源在线${failCount ? `，${failCount} 个来源异常` : ""}`
            : `${items.length} signals, ${okCount} sources online${failCount ? `, ${failCount} offline` : ""}`}
      </p>

      <nav className="kz-nook-chips" aria-label={zh ? "频道" : "Channels"}>
        {CATALOG_CATEGORIES.map((c, i) => (
          <button
            key={c.id}
            type="button"
            className={c.id === category ? "kz-channel active" : "kz-channel"}
            onClick={() => setCategory(c.id)}
            aria-pressed={c.id === category}
          >
            <span className="kz-channel-index" aria-hidden>{(i + 1).toString().padStart(2, "0")}</span>
            <span>{zh ? c.labelZh : c.labelEn}</span>
          </button>
        ))}
      </nav>

      {errorText ? <p className="kz-nook-error" role="status">{errorText}</p> : null}

      {loading && items.length === 0 ? (
        <div className="kz-nook-list" aria-hidden>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="kz-card kz-nook-item kz-nook-skel" />
          ))}
        </div>
      ) : null}

      <ul className="kz-nook-list">
        {visible.map((it, i) => (
          <NookCard
            key={`${it.sourceId}:${it.url}`}
            item={it}
            lang={lang}
            index={i + 1}
            featured={i === 0}
            onOpen={rememberProgress}
          />
        ))}
      </ul>

      {!loading && items.length === 0 && !error ? (
        <div className="kz-card kz-feed-empty">
          <span className="kz-empty-mark" aria-hidden>{failCount ? "! / !" : "-- / --"}</span>
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
            {zh ? "继续读取下一组" : "Load the next signals"}
          </button>
          <span className="kz-nook-progress font-mono tabular-nums">
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
