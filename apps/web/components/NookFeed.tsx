"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CATALOG_BY_ID,
  CATALOG_CATEGORIES,
  DEFAULT_ENABLED_IDS,
  idsForCategory,
  isCatalogCategoryId,
  type CatalogCategoryId,
} from "@/lib/catalog";
import { timeAgo } from "@/lib/format";
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
  items?: RemoteItem[];
  error?: string;
};

type PullSnapshot = {
  at: number;
  items: TimelineItem[];
  okCount: number;
  failCount: number;
};

type PullError = "rate" | "fail";

const PAGE_SIZE = 24;
const ENABLED_KEY = "hotai.nook.enabled";
const CLIENT_TTL_MS = 3 * 60 * 1000;

/** Survives NookFeed remounts (tab switches) within the same JS session. */
const clientPullCache = new Map<string, PullSnapshot>();

function cacheKey(ids: string[]): string {
  return ids.join("\0");
}

function sameIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((id, i) => id === b[i]);
}

function readItems(raw: unknown): RemoteItem[] {
  if (!Array.isArray(raw)) return [];
  const out: RemoteItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const title = typeof rec.title === "string" ? rec.title.trim() : "";
    const url = typeof rec.url === "string" ? rec.url.trim() : "";
    if (!title || !url) continue;
    const image = typeof rec.image === "string" && /^https?:\/\//i.test(rec.image) ? rec.image : null;
    out.push({
      title,
      url,
      summary: typeof rec.summary === "string" ? rec.summary : "",
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
  q.set("src", item.sourceId);
  return `/r?${q.toString()}`;
}

function publishedTs(iso: string | null): number {
  if (!iso) return 0;
  const n = Date.parse(iso);
  return Number.isFinite(n) ? n : 0;
}

function mergeSources(sources: PullSource[]): Omit<PullSnapshot, "at"> {
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
  merged.sort((a, b) => publishedTs(b.publishedAt) - publishedTs(a.publishedAt));
  return { items: merged, okCount: ok, failCount: fail };
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
}: {
  item: TimelineItem;
  lang: "zh" | "en";
}) {
  const when = item.publishedAt ? new Date(item.publishedAt) : null;
  return (
    <li className="kz-card kz-nook-item">
      <Link href={readerHref(item)} className="kz-nook-link">
        {item.image ? <Cover src={item.image} alt="" /> : null}
        <div className="kz-nook-copy">
          <p className="kz-nook-item-meta">
            <span>{item.sourceName}</span>
            {when && Number.isFinite(when.getTime()) ? (
              <>
                <span aria-hidden> · </span>
                <time dateTime={item.publishedAt ?? undefined}>{timeAgo(when, lang)}</time>
              </>
            ) : null}
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
  const [shown, setShown] = useState(PAGE_SIZE);
  const [epoch, setEpoch] = useState(0);
  const [error, setError] = useState<PullError | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const prevEpoch = useRef(0);

  useEffect(() => {
    const next = loadEnabled();
    setEnabled((prev) => (sameIds(prev, next) ? prev : next));
    setReady(true);
  }, []);

  const pullIds = useMemo(() => idsForCategory(category, enabled), [category, enabled]);

  useEffect(() => {
    if (!ready) return;
    const key = cacheKey(pullIds);
    const force = epoch !== prevEpoch.current;
    prevEpoch.current = epoch;
    const cached = clientPullCache.get(key);
    const fresh = Boolean(cached && Date.now() - cached.at < CLIENT_TTL_MS && !force);

    if (cached) {
      setItems(cached.items);
      setOkCount(cached.okCount);
      setFailCount(cached.failCount);
      setError(null);
    } else {
      setItems([]);
      setOkCount(0);
      setFailCount(0);
    }
    setShown(PAGE_SIZE);

    if (fresh) {
      setLoading(false);
      return;
    }

    const ac = new AbortController();
    setLoading(true);

    (async () => {
      try {
        const res = await fetch("/api/catalog/pull", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: pullIds }),
          signal: ac.signal,
        });
        const data = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          sources?: PullSource[];
        } | null;
        if (ac.signal.aborted) return;
        if (!res.ok || !data?.ok || !Array.isArray(data.sources)) {
          if (!cached) {
            setItems([]);
            setOkCount(0);
            setFailCount(pullIds.length);
            setError(data?.error === "rate limited" ? "rate" : "fail");
          }
          return;
        }

        const snap = { at: Date.now(), ...mergeSources(data.sources) };
        clientPullCache.set(key, snap);
        setItems(snap.items);
        setOkCount(snap.okCount);
        setFailCount(snap.failCount);
        setError(null);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (!ac.signal.aborted && !cached) {
          setItems([]);
          setError("fail");
        }
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();

    return () => ac.abort();
  }, [ready, pullIds, epoch]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown((n) => (n < items.length ? n + PAGE_SIZE : n));
        }
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [items.length]);

  const setCategory = useCallback(
    (id: CatalogCategoryId) => {
      const next = new URLSearchParams(params.toString());
      if (id === "mix") next.delete("c");
      else next.set("c", id);
      const q = next.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const visible = items.slice(0, shown);
  const catMeta = CATALOG_CATEGORIES.find((c) => c.id === category);
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

  return (
    <div className="kz-nook">
      <header className="kz-nook-head">
        <div>
          <p className="kz-page-kicker">{zh ? "速闻 · 瀑布流" : "Feed · waterfall"}</p>
          <h1 className="kz-feed-title">{zh ? catMeta?.labelZh ?? "综合" : catMeta?.labelEn ?? "Mix"}</h1>
        </div>
        <div className="kz-nook-meta">
          <span>
            {zh
              ? `${okCount} 源 · ${items.length} 篇`
              : `${okCount} sources · ${items.length} stories`}
            {failCount ? (zh ? ` · ${failCount} 失败` : ` · ${failCount} failed`) : ""}
          </span>
          <button type="button" className="kz-btn" onClick={() => setEpoch((n) => n + 1)} disabled={loading}>
            {loading ? (zh ? "拉取中…" : "Loading…") : zh ? "刷新" : "Refresh"}
          </button>
        </div>
      </header>

      <nav className="kz-nook-chips" aria-label={zh ? "分类" : "Categories"}>
        {CATALOG_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            className={c.id === category ? "kz-chip kz-chip-yellow" : "kz-chip"}
            onClick={() => setCategory(c.id)}
          >
            {zh ? c.labelZh : c.labelEn}
          </button>
        ))}
      </nav>

      {errorText ? <p className="kz-nook-error">{errorText}</p> : null}

      {loading && items.length === 0 ? (
        <div className="kz-nook-list" aria-hidden>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="kz-card kz-nook-item kz-nook-skel" />
          ))}
        </div>
      ) : null}

      <ul className="kz-nook-list">
        {visible.map((it) => (
          <NookCard key={`${it.sourceId}:${it.url}`} item={it} lang={lang} />
        ))}
      </ul>

      {!loading && items.length === 0 && !error ? (
        <div className="kz-card kz-feed-empty">
          <p className="font-bold">{zh ? "这一栏还没有条目" : "Nothing in this lane yet"}</p>
        </div>
      ) : null}

      <div ref={sentinelRef} className="kz-nook-sentinel" aria-hidden />
      {loading && items.length > 0 ? (
        <p className="kz-nook-meta" style={{ justifyContent: "center" }}>
          {zh ? "更新中…" : "Refreshing…"}
        </p>
      ) : null}
    </div>
  );
}
