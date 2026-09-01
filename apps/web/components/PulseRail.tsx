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
    <aside className="ha-pulse ha-card">
      <p className="ha-pulse-kicker">{zh ? "今日脉搏" : "Today's pulse"}</p>
      {digest ? (
        <>
          <h2 className="ha-pulse-headline">
            <Link href="/digest">{digest.headline}</Link>
          </h2>
          {digest.overview ? (
            <p className="ha-pulse-overview">{digest.overview}</p>
          ) : null}
          {digest.themes.length > 0 ? (
            <div className="ha-pulse-themes">
              {digest.themes.slice(0, 3).map((t) => (
                <Link key={t} href={`/search?q=${encodeURIComponent(t)}`} className="ha-chip">
                  {t}
                </Link>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <p className="ha-pulse-overview">
          {zh ? "今日简报尚未生成。抓取后回来看看。" : "No brief yet. Check back after the next fetch."}
        </p>
      )}

      <dl className="ha-pulse-stats">
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

      <Link href="/digest" className="ha-btn ha-pulse-digest">
        {zh ? "今日简报" : "Today's brief"}
      </Link>

      {aiEnabled ? (
        <div className="ha-pulse-ask">
          <AskBox compact />
        </div>
      ) : null}
    </aside>
  );
}
