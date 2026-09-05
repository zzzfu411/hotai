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

export function DigestHeader({ digest, aiEnabled, unavailable = false }: { digest: Loaded; aiEnabled: boolean; unavailable?: boolean }) {
  const { lang } = useLang();
  const zh = lang === "zh";

  if (!digest) {
    return (
      <div className="kz-card kz-digest-empty">
        <p className="kz-page-kicker">{zh ? "今日简报" : "Today's brief"}</p>
        <h1 className="kz-page-title">
          {unavailable ? (zh ? "简报暂时不可用" : "Brief temporarily unavailable") : (zh ? "今日简报尚未发布" : "No brief yet for today.")}
        </h1>
        <p className="kz-page-lede">
          {unavailable ? (zh ? "内容服务暂时不可用，请稍后重试。" : "The content service is unavailable. Please retry shortly.") : aiEnabled
            ? zh
              ? "至少需要 5 篇当日入库文章。等下一次抓取后再来。"
              : "We need at least 5 articles from today to draft a brief. Check back after the next fetch cycle."
            : zh
              ? "本站暂未启用 AI 简报。"
              : "AI briefs are not enabled on this site."}
        </p>
        <p className="kz-page-kicker">{zh ? "UTC 编辑日 · 北京时间每日 08:00 换日" : "UTC editorial day · resets at 00:00 UTC"}</p>
      </div>
    );
  }

  const created = new Date(digest.createdAt);
  const stamp = created.toUTCString().slice(0, 16);

  return (
    <header className="kz-card kz-digest-head">
      <p className="kz-page-kicker">
        {zh ? "今日简报" : "Today's brief"}
        <span>
          {" "}
          · {stamp} UTC
          {digest.model ? ` · ${digest.model}` : ""}
        </span>
      </p>
      <h1 className="kz-page-title">{digest.headline}</h1>
      <p className="kz-page-kicker">{zh ? "UTC 编辑日 · 北京时间每日 08:00 换日" : "UTC editorial day · resets at 00:00 UTC"}</p>
      <p className="kz-page-lede">{digest.overview}</p>
      {digest.themes.length > 0 && (
        <div className="kz-digest-themes">
          {digest.themes.map((t) => (
            <Link key={t} href={`/search?q=${encodeURIComponent(t)}`} className="kz-chip">
              #{t}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
