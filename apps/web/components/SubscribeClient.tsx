"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { readerLink } from "@/lib/reader-link";
import { ReadingList, ReadingBadge } from "./ReadingList";
import { hostname, timeAgo } from "@/lib/format";
import { safeHttpUrl } from "@/lib/safe-url";
import {
  MAX_SOURCES,
  addSource,
  exportOpml,
  formatFeedError,
  isPlaceholderName,
  loadCustomSources,
  mergeOpml,
  parseOpml,
  saveCustomSources,
  type CustomSource,
} from "@/lib/local-sources";
import { useLang } from "./LangContext";

type FeedItem = {
  title: string;
  url: string;
  summary: string;
  publishedAt: string | null;
};

type CachedFeed = { title: string; items: FeedItem[]; stale: boolean; fetchedAt?: string };

type SourceStatus = {
  state: "idle" | "loading" | "ok" | "error";
  message?: string;
  count?: number;
  stale?: boolean;
  fetchedAt?: string;
};

type TimelineItem = FeedItem & { sourceId: string; sourceName: string };

const HN_EXAMPLE = "https://hnrss.org/frontpage";
const DISPLAY_CAP = 300;
const PULL_CONCURRENCY = 4;

async function mapPool<T>(items: T[], n: number, fn: (t: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const idx = cursor++;
      if (idx >= items.length) return;
      await fn(items[idx]!);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, () => worker()));
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function readItems(raw: unknown): FeedItem[] {
  if (!Array.isArray(raw)) return [];
  const out: FeedItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const title = typeof rec.title === "string" ? rec.title.trim() : "";
    const url = typeof rec.url === "string" ? rec.url.trim() : "";
    if (!title || !url) continue;
    out.push({
      title,
      url,
      summary: typeof rec.summary === "string" ? rec.summary : "",
      publishedAt: typeof rec.publishedAt === "string" ? rec.publishedAt : null,
    });
  }
  return out;
}

function downloadText(filename: string, body: string, type: string) {
  const blob = new Blob([body], { type });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(href);
}

export function SubscribeClient() {
  const { lang } = useLang();
  const zh = lang === "zh";
  const [ready, setReady] = useState(false);
  const [sources, setSources] = useState<CustomSource[]>([]);
  const [urlInput, setUrlInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [opmlInput, setOpmlInput] = useState("");
  const [banner, setBanner] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, SourceStatus>>({});
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const cacheRef = useRef(new Map<string, CachedFeed>());
  const sourcesRef = useRef(sources);
  useLayoutEffect(() => { sourcesRef.current = sources; }, [sources]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [storageFailed, setStorageFailed] = useState(false);

  useEffect(() => {
    setSources(loadCustomSources());
    setReady(true);
  }, []);

  const persist = useCallback((next: CustomSource[]) => {
    setSources(next);
    setStorageFailed(!saveCustomSources(next));
  }, []);

  const enabled = useMemo(() => sources.filter((s) => s.enabled), [sources]);
  const fetchKey = `${epoch}|${enabled.map((s) => `${s.id}:${s.url}`).join("|")}`;

  useEffect(() => {
    if (!ready) return;
    const ac = new AbortController();
    const enabledNow = sources.filter((s) => s.enabled);

    if (enabledNow.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }

    setItems((prev) => prev.filter((it) => enabledNow.some((s) => s.id === it.sourceId)));

    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setBanner(null);
      const merged: TimelineItem[] = [];
      const nextStatus: Record<string, SourceStatus> = {};
      const namePatches = new Map<string, string>();

      const publish = () => {
        const sorted = merged.slice().sort((a, b) => {
          const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
          const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
          const na = Number.isFinite(ta) ? ta : 0;
          const nb = Number.isFinite(tb) ? tb : 0;
          return nb - na;
        });
        const seen = new Set<string>();
        const unique: TimelineItem[] = [];
        for (const it of sorted) {
          if (seen.has(it.url)) continue;
          seen.add(it.url);
          unique.push(it);
          if (unique.length >= DISPLAY_CAP) break;
        }
        setItems(unique);
        setStatuses({ ...nextStatus });
      };

      const pullOne = async (src: CustomSource) => {
        if (cancelled) return;
        const cached = cacheRef.current.get(src.url);
        if (cached) {
          nextStatus[src.id] = { state: "ok", count: cached.items.length, fetchedAt: cached.fetchedAt,
            stale: cached.stale || Boolean(cached.fetchedAt && Date.now() - Date.parse(cached.fetchedAt) > 8 * 60_000) };
          for (const it of cached.items) {
            merged.push({ ...it, sourceId: src.id, sourceName: cached.title || src.name });
          }
          if (cached.title && isPlaceholderName(src)) namePatches.set(src.id, cached.title);
          publish();
          return;
        }

        nextStatus[src.id] = { state: "loading" };
        setStatuses((prev) => ({ ...prev, [src.id]: { state: "loading" } }));

        try {
          let res: Response | null = null;
          let body: { ok?: boolean; title?: string; items?: unknown; error?: string; stale?: boolean; fetchedAt?: string } = {};
          for (let attempt = 0; attempt < 3; attempt++) {
            res = await fetch(`/api/proxy/feed?url=${encodeURIComponent(src.url)}`, {
              signal: ac.signal,
            });
            body = (await res.json().catch(() => ({}))) as typeof body;
            if (cancelled) return;
            const rate = res.status === 429 || (typeof body.error === "string" && /rate\s*limit/i.test(body.error));
            if (rate && attempt < 2) {
              const retryRaw = res.headers.get("retry-after");
              const sec = retryRaw && Number.isFinite(Number(retryRaw)) ? Number(retryRaw) : 5;
              await sleep(Math.min(60, Math.max(1, sec)) * 1000, ac.signal);
              continue;
            }
            break;
          }
          if (cancelled || !res) return;

          if (!res.ok || !body.ok) {
            const error = typeof body.error === "string" ? body.error : `HTTP ${res.status}`;
            const retryRaw = res.headers.get("retry-after");
            const retryAfterSec = retryRaw ? Number(retryRaw) : undefined;
            const message = formatFeedError({ status: res.status, error, retryAfterSec }, lang);
            nextStatus[src.id] = { state: "error", message };
            if (res.status === 429 || /rate\s*limit/i.test(error)) setBanner(message);
            publish();
            return;
          }

          const feedItems = readItems(body.items);
          const title = typeof body.title === "string" ? body.title.trim() : "";
          cacheRef.current.set(src.url, { title, items: feedItems, stale: body.stale === true, fetchedAt: body.fetchedAt });
          nextStatus[src.id] = { state: "ok", count: feedItems.length, stale: body.stale === true, fetchedAt: body.fetchedAt };
          for (const it of feedItems) {
            merged.push({ ...it, sourceId: src.id, sourceName: title || src.name });
          }
          if (title && isPlaceholderName(src)) namePatches.set(src.id, title);
          publish();
        } catch (err) {
          if (cancelled || ac.signal.aborted) return;
          const message = err instanceof Error ? err.message : zh ? "拉取失败。" : "Fetch failed.";
          nextStatus[src.id] = { state: "error", message };
          publish();
        }
      };

      await mapPool(enabledNow, PULL_CONCURRENCY, pullOne);

      if (cancelled) return;
      if (namePatches.size > 0) {
        persist(sourcesRef.current.map((s) =>
          namePatches.has(s.id) ? { ...s, name: namePatches.get(s.id)! } : s,
        ));
      }
      publish();
      setLoading(false);
    };

    void run();
    return () => {
      cancelled = true;
      ac.abort();
    };
    // fetchKey captures enabled urls + refresh epoch; sources is read inside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, fetchKey]);

  const onAddUrl = (rawUrl: string, rawName?: string) => {
    setBanner(null);
    const result = addSource(sources, rawUrl, rawName);
    if (result.error === "invalid") {
      setBanner(zh ? "请输入 http(s) RSS / Atom / JSON Feed 地址。" : "Enter an http(s) RSS, Atom, or JSON Feed URL.");
      return;
    }
    if (result.error === "duplicate") {
      setBanner(zh ? "已经添加过这个源。" : "That feed is already on the list.");
      return;
    }
    if (result.error === "full") {
      setBanner(zh ? `最多 ${MAX_SOURCES} 个源。` : `Cap is ${MAX_SOURCES} sources.`);
      return;
    }
    persist(result.sources);
    setUrlInput("");
    setNameInput("");
    setNotice(zh ? "已添加。时间线只在本机显示，不进热榜。" : "Added. Timeline stays in this browser — not the hot list.");
  };

  const onImportOpml = (xml: string) => {
    setBanner(null);
    if (!xml.trim()) {
      setBanner(zh ? "把 OPML 文本贴进来。" : "Paste OPML text first.");
      return;
    }
    if (parseOpml(xml).length === 0) {
      setBanner(zh ? "这段文本里没有 xmlUrl 条目。" : "No xmlUrl outlines in that text.");
      return;
    }
    const merged = mergeOpml(sources, xml);
    persist(merged.sources);
    setOpmlInput("");
    setNotice(
      zh
        ? `导入 ${merged.added} 条，跳过 ${merged.skipped} 条。自定义源不写入热榜。`
        : `Imported ${merged.added}, skipped ${merged.skipped}. Custom sources never hit the hot list.`,
    );
  };

  const onImportEditorial = async () => {
    setBanner(null);
    try {
      const res = await fetch("/hotai.opml");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();
      onImportOpml(xml);
    } catch {
      setBanner(zh ? "下载 /hotai.opml 失败。" : "Could not download /hotai.opml.");
    }
  };

  const onExport = () => {
    downloadText("hotai-subscribe.opml", exportOpml(sources), "text/x-opml+xml;charset=utf-8");
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setBanner(zh ? "OPML 文件不能超过 1 MB。" : "OPML files must be at most 1 MB.");
      return;
    }
    try { onImportOpml(await file.text()); }
    catch { setBanner(zh ? "无法读取此文件，请重试。" : "Could not read this file. Try again."); }
  };

  const refresh = () => {
    cacheRef.current.clear();
    setEpoch((n) => n + 1);
  };

  if (!ready) {
    return (
      <div className="kz-page">
        <p className="kz-page-kicker">{zh ? "我的订阅" : "My feeds"}</p>
        <h1 className="kz-page-title">{zh ? "自建 RSS / OPML" : "Custom RSS / OPML"}</h1>
      </div>
    );
  }

  return (
    <div className="kz-page">
      <h1 className="sr-only">{zh ? "我的阅读与订阅" : "My reading and subscriptions"}</h1>
      <ReadingList />
      <header className="kz-page-head">
        <div>
          <p className="kz-page-kicker">{zh ? "我的订阅 · 仅本机" : "Subscribe · this browser"}</p>
          <h2 className="kz-page-title">{zh ? "自建 RSS / OPML" : "Custom RSS / OPML"}</h2>
          <p className="kz-page-lede">
            {zh ? (
              <>
                订阅仅保存在此浏览器，可导出 OPML 备份或带到其他设备。
                <strong> 不影响全站热榜。</strong>
                推荐源目录：
                <a href="/hotai.opml" download>
                  下载 OPML
                </a>
                。
              </>
            ) : (
              <>
                Subscriptions stay in this browser. Export OPML to back them up or move to another device.
                <strong> They do not affect the global hot list.</strong> Recommended feeds:{" "}
                <a href="/hotai.opml" download>
                  Download OPML
                </a>
                .
              </>
            )}
          </p>
        </div>
        <div className="kz-sub-actions">
          <a href="/hotai.opml" className="kz-btn kz-btn-sm" download>
            {zh ? "下载编辑 OPML" : "Download catalog OPML"}
          </a>
          <button type="button" className="kz-btn kz-btn-sm" onClick={() => void onImportEditorial()}>
            {zh ? "导入编辑目录" : "Import catalog"}
          </button>
          <button type="button" className="kz-btn kz-btn-sm" onClick={onExport} disabled={sources.length === 0}>
            {zh ? "导出我的 OPML" : "Export my OPML"}
          </button>
        </div>
      </header>

      <section className="kz-card kz-sub-panel">
        <h2>{zh ? "添加 RSS" : "Add RSS"}</h2>
        <form
          className="kz-sub-form"
          onSubmit={(e) => {
            e.preventDefault();
            onAddUrl(urlInput, nameInput);
          }}
        >
          <label className="kz-sub-label" htmlFor="sub-url">
            {zh ? "Feed 地址" : "Feed URL"}
          </label>
          <div className="kz-search kz-search-wide">
            <input
              id="sub-url"
              className="kz-input"
              type="text"
              inputMode="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder={HN_EXAMPLE}
              autoComplete="off"
              spellCheck={false}
            />
            <button className="kz-search-go kz-search-go-label" type="submit">
              {zh ? "添加" : "Add"}
            </button>
          </div>
          <label className="kz-sub-label" htmlFor="sub-name">
            {zh ? "名称（可留空，用 feed 标题）" : "Name (optional — uses the feed title)"}
          </label>
          <input
            id="sub-name"
            className="kz-field"
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder={zh ? "例如 Hacker News" : "e.g. Hacker News"}
          />
        </form>
      </section>

      <section className="kz-card kz-sub-panel">
        <h2>{zh ? "粘贴 OPML" : "Paste OPML"}</h2>
        <form
          className="kz-sub-form"
          onSubmit={(e) => {
            e.preventDefault();
            onImportOpml(opmlInput);
          }}
        >
          <label className="kz-sub-label" htmlFor="sub-opml">
            {zh ? "包含 xmlUrl 的 outline" : "Outlines with xmlUrl"}
          </label>
          <textarea
            id="sub-opml"
            className="kz-textarea"
            value={opmlInput}
            onChange={(e) => setOpmlInput(e.target.value)}
            placeholder={'<outline type="rss" text="HN" xmlUrl="https://hnrss.org/frontpage"/>'}
            spellCheck={false}
          />
          <div className="kz-sub-actions">
            <button className="kz-btn" type="submit">
              {zh ? "导入 OPML" : "Import OPML"}
            </button>
            <button type="button" className="kz-btn" onClick={() => fileRef.current?.click()}>
              {zh ? "选择文件" : "Choose file"}
            </button>
              <input
                ref={fileRef}
                type="file"
                accept=".opml,.xml,text/xml,application/xml,text/x-opml+xml"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  void onFile(file);
                }}
              />
          </div>
        </form>
      </section>

      {banner ? (
        <p className="kz-sub-error" role="alert">
          {banner}
        </p>
      ) : null}
      {storageFailed && <p className="kz-sub-error" role="status">{zh ? "浏览器未能保存订阅。当前修改仅在本次会话有效，请导出 OPML 备份。" : "This browser could not save your subscriptions. Changes last for this session; export OPML to keep a backup."}</p>}
      {notice ? <p className="kz-sub-notice">{notice}</p> : null}

      {sources.length === 0 ? (
        <div className="kz-card kz-feed-empty kz-sub-empty">
          <p className="font-bold">{zh ? "还没有自定义源" : "No custom sources yet"}</p>
          <p>
            {zh
              ? "这是浏览器本机订阅，不会影响全站热榜，也不会进数据库。试试 Hacker News 的 RSS，或下载 /hotai.opml 再贴回来。"
              : "This is a browser-local subscription. It does not change the global hot list or touch the database. Try Hacker News RSS, or download /hotai.opml and paste it back."}
          </p>
          <div className="kz-sub-actions kz-sub-empty-actions">
            <button type="button" className="kz-btn" onClick={() => onAddUrl(HN_EXAMPLE, "Hacker News")}>
              {zh ? "添加 Hacker News" : "Add Hacker News"}
            </button>
            <a href="/hotai.opml" className="kz-btn" download>
              {zh ? "下载 /hotai.opml" : "Download /hotai.opml"}
            </a>
          </div>
        </div>
      ) : (
        <section className="kz-sub-list-wrap">
          <header className="kz-feed-head">
            <div>
              <p className="kz-page-kicker">{zh ? "源" : "Sources"}</p>
              <h2 className="kz-feed-title">
                {zh ? `我的源 · ${sources.length}/${MAX_SOURCES}` : `My sources · ${sources.length}/${MAX_SOURCES}`}
              </h2>
            </div>
            <button type="button" className="kz-btn kz-btn-sm" onClick={refresh} disabled={loading}>
              {zh ? "重新拉取" : "Refresh"}
            </button>
          </header>
          <ul className="kz-sub-sources">
            {sources.map((src) => {
              const st = statuses[src.id];
              return (
                <li key={src.id} className={src.enabled ? "kz-card kz-sub-source" : "kz-card kz-sub-source kz-sub-source-off"}>
                  <div className="kz-sub-source-main">
                    <p className="kz-sub-source-name">{src.name}</p>
                    <p className="kz-sub-source-url">{src.url}</p>
                    {st?.state === "loading" ? (
                      <p className="kz-sub-status">{zh ? "拉取中…" : "Fetching…"}</p>
                    ) : null}
                    {st?.state === "ok" ? (
                      <p className="kz-sub-status">
                        {zh ? `${st.count ?? 0} 条` : `${st.count ?? 0} items`}
                        {st.stale ? (zh ? " · 陈旧缓存" : " · stale cache") : ""}
                        {st.fetchedAt ? ` · ${new Date(st.fetchedAt).toLocaleString(zh ? "zh-CN" : "en-GB")}` : ""}
                      </p>
                    ) : null}
                    {st?.state === "error" && st.message ? (
                      <p className="kz-sub-status kz-sub-status-err">{st.message}</p>
                    ) : null}
                  </div>
                  <div className="kz-sub-source-actions">
                    <button
                      type="button"
                      className={src.enabled ? "kz-chip active" : "kz-chip"}
                      aria-pressed={src.enabled}
                      onClick={() => persist(sources.map((s) => (s.id === src.id ? { ...s, enabled: !s.enabled } : s)))}
                    >
                      {src.enabled ? (zh ? "启用" : "On") : zh ? "停用" : "Off"}
                    </button>
                    <button
                      type="button"
                      className="kz-chip"
                      onClick={() => {
                        cacheRef.current.delete(src.url);
                        persist(sources.filter((s) => s.id !== src.id));
                      }}
                    >
                      {zh ? "删除" : "Remove"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {sources.length > 0 ? (
        <section className="kz-feed kz-sub-feed">
          <header className="kz-feed-head">
            <div>
              <p className="kz-page-kicker">{zh ? "时间线 · 按发布时间" : "Timeline · publishedAt"}</p>
              <h2 className="kz-feed-title">{zh ? "我的订阅" : "My subscriptions"}</h2>
            </div>
            <p className="kz-feed-count">
              {items.length}
              {zh ? " 篇" : items.length === 1 ? " story" : " stories"}
            </p>
          </header>
          {loading && items.length === 0 ? (
            <div className="kz-card kz-feed-empty">
              <p className="font-bold">{zh ? "正在拉取源…" : "Fetching feeds…"}</p>
              <p>{zh ? "缓存命中不计配额；失败会原样显示。" : "Cached feeds skip the quota. Failures are shown as-is."}</p>
            </div>
          ) : items.length === 0 ? (
            <div className="kz-card kz-feed-empty">
              <p className="font-bold">{zh ? "还没有条目" : "No items yet"}</p>
              <p>
                {zh
                  ? enabled.length === 0
                    ? "打开至少一个源，或稍后再试。"
                    : "源已启用，但这次没有拉到条目。"
                  : enabled.length === 0
                    ? "Enable at least one source."
                    : "Sources are on, but this pull returned nothing."}
              </p>
            </div>
          ) : (
            <div className="kz-feed-list">
              {items.map((it) => (
                <article key={it.url} className="kz-card kz-article">
                  <div className="kz-article-body">
                    {(() => {
                      const safe = safeHttpUrl(it.url);
                      if (!safe) return <span className="kz-article-main">{it.title}</span>;
                      return <Link href={readerLink({ ...it, source: it.sourceName })} className="kz-article-main">
                      <span className="kz-article-title-row">
                        <span className="kz-article-title">{it.title}</span>
                      </span>
                      {it.summary ? <span className="kz-article-summary">{it.summary}</span> : null}
                      </Link>;
                    })()}
                    <div className="kz-article-meta">
                      <ReadingBadge story={it} />
                      <span className="kz-chip">{it.sourceName}</span>
                      {safeHttpUrl(it.url) ? <span className="kz-chip kz-host">{hostname(it.url)}</span> : null}
                      {it.publishedAt && !Number.isNaN(Date.parse(it.publishedAt)) ? (
                        <time dateTime={it.publishedAt}>{timeAgo(new Date(it.publishedAt), lang)}</time>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
