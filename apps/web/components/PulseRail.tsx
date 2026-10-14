"use client";

import Link from "next/link";
import { AskBox } from "./AskBox";
import { useLang } from "./LangContext";

export type PulseDigest = {
  headline: string;
  overview: string;
  themes: string[];
} | null;

export type PulseStats = {
  enabledSources: number;
  articles24h: number;
  lastFetch: string;
};

export function PulseRail({
  digest,
  stats,
  aiEnabled,
}: {
  digest: PulseDigest;
  stats: PulseStats;
  aiEnabled: boolean;
}) {
  const { lang } = useLang();
  const zh = lang === "zh";

  return (
    <aside className="kz-card kz-pulse" aria-label={zh ? "今日脉搏" : "Today's pulse"}>
      <p className="kz-pulse-kicker">
        <span className="kz-live-dot" aria-hidden />
        {zh ? "今日脉搏" : "Today's pulse"}
      </p>
      {digest ? (
        <>
          <h2 className="kz-pulse-headline">
            <Link href="/digest">{digest.headline}</Link>
          </h2>
          {digest.overview ? <p className="kz-pulse-overview">{digest.overview}</p> : null}
          {digest.themes.length > 0 ? (
            <div className="kz-pulse-themes">
              {digest.themes.slice(0, 4).map((t) => (
                <Link key={t} href={`/search?q=${encodeURIComponent(t)}`} className="kz-topic">
                  #{t}
                </Link>
              ))}
            </div>
          ) : null}
          <Link href="/digest" className="kz-btn kz-btn-sm kz-pulse-digest">
            {zh ? "阅读今日简报 →" : "Read today's brief →"}
          </Link>
        </>
      ) : (
        <p className="kz-pulse-overview kz-pulse-empty">
          {aiEnabled
            ? zh ? "今日简报会在下一轮抓取后生成。" : "Today's brief is drafted after the next fetch."
            : zh ? "本站暂未启用 AI 简报。" : "AI briefs are not enabled on this site."}
        </p>
      )}

      <dl className="kz-pulse-stats">
        <div>
          <dt>{zh ? "来源" : "Sources"}</dt>
          <dd>{stats.enabledSources}</dd>
        </div>
        <div>
          <dt>{zh ? "24 小时" : "24h"}</dt>
          <dd>{stats.articles24h}</dd>
        </div>
        <div>
          <dt>{zh ? "抓取 · 北京时间" : "Last fetch"}</dt>
          <dd>{stats.lastFetch}</dd>
        </div>
      </dl>

      {aiEnabled ? (
        <div className="kz-pulse-ask">
          <AskBox compact />
        </div>
      ) : null}
    </aside>
  );
}
