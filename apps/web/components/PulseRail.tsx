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
}: {
  digest: PulseDigest;
  stats: PulseStats;
}) {
  const { lang } = useLang();
  const zh = lang === "zh";

  return (
    <aside className="kz-pulse kz-card">
      <p className="kz-pulse-kicker">{zh ? "今日脉搏" : "Today's pulse"}</p>
      {digest ? (
        <>
          <h2 className="kz-pulse-headline">
            <Link href="/digest">{digest.headline}</Link>
          </h2>
          {digest.overview ? (
            <p className="kz-pulse-overview">{digest.overview}</p>
          ) : null}
          {digest.themes.length > 0 ? (
            <div className="kz-pulse-themes">
              {digest.themes.slice(0, 3).map((t) => (
                <Link key={t} href={`/search?q=${encodeURIComponent(t)}`} className="kz-chip">
                  {t}
                </Link>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <p className="kz-pulse-overview">
          {zh ? "今日简报尚未生成。抓取后回来看看。" : "No brief yet. Check back after the next fetch."}
        </p>
      )}

      <dl className="kz-pulse-stats">
        <div>
          <dt>{zh ? "来源" : "Sources"}</dt>
          <dd>{stats.enabledSources}</dd>
        </div>
        <div>
          <dt>{zh ? "24小时" : "24h"}</dt>
          <dd>{stats.articles24h}</dd>
        </div>
        <div>
          <dt>{zh ? "抓取" : "Fetch"}</dt>
          <dd>{stats.lastFetch}</dd>
        </div>
      </dl>

      <Link href="/digest" className="kz-btn kz-pulse-digest">
        {zh ? "今日简报" : "Today's brief"}
      </Link>

      <div className="kz-pulse-ask">
        <AskBox compact />
      </div>
    </aside>
  );
}
