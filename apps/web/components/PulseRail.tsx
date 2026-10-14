"use client";

import Link from "next/link";
import { AskBox } from "./AskBox";
import { useLang } from "./LangContext";

export type PulseDigest = {
  headline: string;
  overview: string;
  themes: string[];
} | null;

export function PulseRail({
  digest,
  aiEnabled,
}: {
  digest: PulseDigest;
  aiEnabled: boolean;
}) {
  const { lang } = useLang();
  const zh = lang === "zh";

  return (
    <aside className={digest ? "kz-card kz-pulse" : "kz-card kz-pulse is-empty"} aria-label={zh ? "今日简报" : "Today's brief"}>
      <p className="kz-pulse-kicker">
        <span className="kz-live-dot" aria-hidden />
        {zh ? "今日简报" : "Today's brief"}
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
                <Link key={t} href={`/search?q=${encodeURIComponent(t)}`} className="kz-topic" prefetch={false}>
                  #{t}
                </Link>
              ))}
            </div>
          ) : null}
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

      {aiEnabled ? (
        <div className="kz-pulse-ask">
          <AskBox compact />
        </div>
      ) : null}
    </aside>
  );
}
