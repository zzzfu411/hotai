"use client";

import Link from "next/link";
import { useLang } from "./LangContext";

type Loaded = {
  headline: string;
  overview: string;
  themes: string[];
  model?: string | null;
  createdAt: Date | string;
} | null;

export function DigestHeader({ digest, aiEnabled }: { digest: Loaded; aiEnabled: boolean }) {
  const { lang } = useLang();
  const zh = lang === "zh";

  if (!digest) {
    return (
      <div className="ha-card ha-digest-empty">
        <p className="ha-page-kicker">{zh ? "今日简报" : "Today's brief"}</p>
        <h1 className="ha-page-title">
          {zh ? "今日简报正在生成…" : "No brief yet for today."}
        </h1>
        <p className="ha-page-lede">
          {aiEnabled
            ? zh
              ? "至少需要 5 篇当日入库文章。等下一次抓取后再来。"
              : "We need at least 5 articles from today to draft a brief. Check back after the next fetch cycle."
            : zh
              ? "未配置 AI 鉴权，简报功能未启用。"
              : "AI brief is disabled — configure ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY."}
        </p>
      </div>
    );
  }

  const created = new Date(digest.createdAt);
  const stamp = created.toUTCString().slice(0, 16);

  return (
    <header className="ha-card ha-digest-head">
      <p className="ha-page-kicker">
        {zh ? "今日简报" : "Today's brief"}
        <span>
          {" "}
          · {stamp} UTC
          {digest.model ? ` · ${digest.model}` : ""}
        </span>
      </p>
      <h1 className="ha-page-title">{digest.headline}</h1>
      <p className="ha-page-lede">{digest.overview}</p>
      {digest.themes.length > 0 && (
        <div className="ha-digest-themes">
          {digest.themes.map((t) => (
            <Link key={t} href={`/search?q=${encodeURIComponent(t)}`} className="ha-chip">
              #{t}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
