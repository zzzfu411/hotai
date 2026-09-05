"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useState } from "react";
import { loadReadingEntries, removeReading, storyState, subscribeReading, type ReadingEntry } from "@/lib/reading-list";
import { readerLink, type ReadableStory } from "@/lib/reader-link";
import { useLang } from "./LangContext";

const ReadingContext = createContext<ReadingEntry[]>([]);

export function ReadingProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<ReadingEntry[]>([]);
  useEffect(() => {
    const refresh = () => setEntries(loadReadingEntries());
    refresh();
    return subscribeReading(refresh);
  }, []);
  return <ReadingContext.Provider value={entries}>{children}</ReadingContext.Provider>;
}

export function useReadingEntries() { return useContext(ReadingContext); }

export function ReadingBadge({ story }: { story: ReadableStory }) {
  const entries = useReadingEntries();
  const { lang } = useLang();
  const state = storyState(entries, story);
  if (!state) return null;
  return <span className="kz-chip">{state === "read" ? (lang === "zh" ? "已读" : "Read") : (lang === "zh" ? "稍后读" : "Saved")}</span>;
}

export function ReadingList() {
  const entries = useReadingEntries();
  const { lang } = useLang();
  const zh = lang === "zh";
  const [filter, setFilter] = useState<"later" | "read">("later");
  const [failed, setFailed] = useState(false);
  const visible = entries.filter((entry) => entry.state === filter).reverse();
  return <section className="kz-saved" aria-labelledby="saved-title">
    <header className="kz-feed-head">
      <h2 id="saved-title" className="kz-feed-title">{zh ? "我的阅读" : "My reading"}</h2>
      <div role="group" aria-label={zh ? "阅读状态" : "Reading state"}>
        {(["later", "read"] as const).map((state) => <button key={state} type="button"
          className="kz-chip" aria-pressed={filter === state} onClick={() => setFilter(state)}>
          {state === "later" ? (zh ? "稍后读" : "Read later") : (zh ? "已读" : "Read")}
        </button>)}
      </div>
    </header>
    <p className="kz-page-lede">{zh ? "保存在此浏览器。站内文章过期后，可通过保留的原文链接继续阅读。" : "Saved in this browser. Original links remain available after stored articles expire."}</p>
    {failed && <p role="status">{zh ? "保存失败，修改仅在本次会话有效。" : "Could not save. Changes last only for this session."}</p>}
    {visible.length === 0 ? <p className="kz-card kz-feed-empty">{zh ? "还没有阅读记录。在文章中选择“稍后读”即可收进这里。" : "No reading records yet. Choose Read later in an article to save it here."}</p> :
      <ul className="kz-saved-list">{visible.map((entry) => <li key={entry.key} className="kz-card kz-saved-item">
        <Link href={readerLink(entry)}>{entry.title}</Link>
        <div className="kz-article-meta">
          {entry.source && <span>{entry.source}</span>}
          {entry.url ? <a href={entry.url} target="_blank" rel="noopener noreferrer">{zh ? "原文" : "Original"}</a> :
            <span>{zh ? "旧记录：站内文章可能已过期" : "Legacy bookmark: stored article may have expired"}</span>}
          <button type="button" className="kz-chip" onClick={() => setFailed(!removeReading(entry.key))}>{zh ? "移除" : "Remove"}</button>
        </div>
      </li>)}</ul>}
  </section>;
}
