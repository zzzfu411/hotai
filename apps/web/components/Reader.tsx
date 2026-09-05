"use client";

import { useEffect, useRef, useState } from "react";
import { useLang } from "./LangContext";
import { storyState, toggleReading, hydrateReadingStory } from "@/lib/reading-list";
import type { ReadableStory } from "@/lib/reader-link";
import { useReadingEntries } from "./ReadingList";

type BodyStatus = "ssr" | "loading" | "ok" | "fail";

const READER_TTL_MS = 10 * 60 * 1000;
const readerBodyCache = new Map<string, { at: number; html: string }>();

type ReaderBodyProps = {
  url: string;
  fallbackSummary: string;
};

/**
 * Fetches extracted HTML from POST /api/readability.
 * HTML is already DOMPurified on the server — inject as-is. Never iframe.
 */
export function ReaderBody({ url, fallbackSummary }: ReaderBodyProps) {
  const { lang } = useLang();
  const zh = lang === "zh";
  const [status, setStatus] = useState<BodyStatus>("ssr");
  const [html, setHtml] = useState("");
  const proseRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cached = readerBodyCache.get(url);
    if (cached && Date.now() - cached.at < READER_TTL_MS) {
      setHtml(cached.html);
      setStatus("ok");
      return;
    }

    const ac = new AbortController();
    setStatus("loading");
    setHtml("");

    (async () => {
      try {
        const res = await fetch("/api/readability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
          signal: ac.signal,
        });
        const data = (await res.json().catch(() => null)) as {
          ok?: boolean;
          contentHtml?: unknown;
        } | null;
        if (ac.signal.aborted) return;
        const content =
          res.ok && data?.ok && typeof data.contentHtml === "string"
            ? data.contentHtml.trim()
            : "";
        if (content) {
          readerBodyCache.set(url, { at: Date.now(), html: content });
          setHtml(content);
          setStatus("ok");
        } else {
          setStatus("fail");
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (!ac.signal.aborted) setStatus("fail");
      }
    })();

    return () => ac.abort();
  }, [url]);

  useEffect(() => {
    const root = proseRef.current;
    if (!root) return;
    for (const a of root.querySelectorAll("a[href]")) {
      const href = a.getAttribute("href") || "";
      if (/^https?:/i.test(href)) {
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "noopener noreferrer");
      }
    }
  }, [html]);

  if (status === "ok") {
    return (
      <div
        ref={proseRef}
        className="reader-prose"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  if (status === "loading") {
    return (
      <div className="kz-reader-loading" aria-busy="true" aria-live="polite">
        <p className="kz-reader-loading-label">
          {zh ? "正在抽取正文…" : "Extracting article…"}
        </p>
        <div className="skeleton kz-reader-skel" />
        <div className="skeleton kz-reader-skel" />
        <div className="skeleton kz-reader-skel kz-reader-skel-short" />
      </div>
    );
  }

  return (
    <div className="kz-card kz-reader-fallback">
      {status === "fail" ? (
        <p className="kz-reader-fallback-msg">
          {zh ? "未能抽取正文，可阅读摘要或打开原文。" : "Couldn’t extract the article. Read the summary or open the original."}
        </p>
      ) : null}
      {fallbackSummary ? <p className="kz-reader-fallback-summary">{fallbackSummary}</p> : null}
      <a className="kz-btn" href={url} target="_blank" rel="noopener noreferrer">
        {zh ? "打开原文" : "Open original"}
      </a>
    </div>
  );
}

export function ReadingFlags({ story }: { story: ReadableStory }) {
  const { lang } = useLang();
  const zh = lang === "zh";
  const entries = useReadingEntries();
  const state = storyState(entries, story);
  const later = state === "later";
  const read = state === "read";
  const [failed, setFailed] = useState(false);
  const { articleId, url, title, source, summary } = story;
  useEffect(() => {
    if (!hydrateReadingStory({ articleId, url, title, source, summary })) setFailed(true);
  }, [articleId, url, title, source, summary]);

  return (
    <div className="kz-reader-flags">
      <button
        type="button"
        className={later ? "kz-btn kz-btn-sm active" : "kz-btn kz-btn-sm"}
        aria-pressed={later}
        onClick={() => {
          setFailed(!toggleReading(story, "later"));
        }}
      >
        {zh ? (later ? "已稍后" : "稍后读") : later ? "Saved" : "Read later"}
      </button>
      <button
        type="button"
        className={read ? "kz-btn kz-btn-sm active" : "kz-btn kz-btn-sm"}
        aria-pressed={read}
        onClick={() => {
          setFailed(!toggleReading(story, "read"));
        }}
      >
        {zh ? (read ? "已读" : "标为已读") : read ? "Read" : "Mark read"}
      </button>
      {failed && <p role="status">{zh ? "无法保存到浏览器，标记仅在本次会话有效。" : "Could not save to this browser. This mark lasts only for this session."}</p>}
    </div>
  );
}
