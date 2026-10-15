"use client";

import Link from "next/link";
import type { TopicCount } from "@/lib/article";
import { AskBox } from "./AskBox";
import { useLang } from "./LangContext";

export type PulseDigest = {
  headline: string;
  overview: string;
  themes: string[];
  /** UTC day the brief was edited for (ISO). */
  date: string;
  /** Today's brief isn't out yet; this is the latest earlier one. */
  earlier: boolean;
} | null;

const DAY = {
  zh: new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", timeZone: "UTC" }),
  en: new Intl.DateTimeFormat("en-GB", { month: "short", day: "numeric", timeZone: "UTC" }),
} as const;

export function PulseRail({
  digest,
  aiEnabled,
  topics = [],
}: {
  digest: PulseDigest;
  aiEnabled: boolean;
  /** Topics shared across the hot list, most common first. */
  topics?: TopicCount[];
}) {
  const { lang } = useLang();
  const zh = lang === "zh";
  const kicker = digest?.earlier
    ? `${zh ? "最近简报" : "Latest brief"} · ${DAY[lang].format(new Date(digest.date))}`
    : zh ? "今日简报" : "Today's brief";

  return (
    <aside className={digest ? "kz-card kz-pulse" : "kz-card kz-pulse is-empty"} aria-label={zh ? "简报与话题" : "Brief and topics"}>
      <p className="kz-pulse-kicker">
        <span className={digest?.earlier ? "kz-live-dot is-warn" : "kz-live-dot"} aria-hidden />
        {kicker}
      </p>
      {digest ? (
        <>
          <h2 className="kz-pulse-headline">
            <Link href="/digest">{digest.headline}</Link>
          </h2>
          {digest.overview ? <p className="kz-pulse-overview">{digest.overview}</p> : null}
          <Link href="/digest" className="kz-btn kz-btn-sm kz-pulse-digest">
            {zh ? "阅读简报 →" : "Read the brief →"}
          </Link>
        </>
      ) : (
        <p className="kz-pulse-overview">
          {aiEnabled
            ? zh ? "今日简报会在当天入库满 5 篇后生成。" : "Today's brief is drafted once five stories are stored today."
            : zh ? "本站暂未启用 AI 简报。" : "AI briefs are not enabled on this site."}
        </p>
      )}

      {topics.length > 0 ? (
        <section className="kz-pulse-topics" aria-label={zh ? "热门话题" : "Hot topics"}>
          <h3 className="kz-pulse-label">{zh ? "热门话题" : "Hot topics"}</h3>
          <ul>
            {topics.map((t) => (
              <li key={t.name}>
                <Link href={`/search?q=${encodeURIComponent(t.name)}`} prefetch={false}>
                  <span>#{t.name}</span>
                  <span className="kz-pulse-count">{t.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {aiEnabled ? (
        <div className="kz-pulse-ask">
          <AskBox compact />
        </div>
      ) : null}
    </aside>
  );
}
