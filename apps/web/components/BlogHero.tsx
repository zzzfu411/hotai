"use client";

import { useLang } from "./LangContext";

export function BlogHero({ total, featured }: { total: number; featured: number }) {
  const { lang } = useLang();
  const zh = lang === "zh";

  return (
    <header className="kz-blog-hero">
      <p className="kz-page-kicker">{zh ? "研究者 · 长期收录" : "Researchers · evergreen"}</p>
      <h1 className="kz-page-title">
        {zh ? "AI 领域值得长期订阅的博客" : "High-signal blogs from people who build AI"}
      </h1>
      <p className="kz-page-lede">
        {zh
          ? "编辑精选的研究员与从业者博客，不随 14 天新闻窗口过期。每个博客附「食用指南」：更新节奏、怎么读、推荐从哪篇开始。"
          : "An editorial shortlist of researcher and practitioner blogs, kept outside the 14-day news window. Each has a reading guide: cadence, how to read, and where to start."}
      </p>
      <dl className="kz-page-stats">
        <div>
          <dt>{zh ? "收录" : "Listed"}</dt>
          <dd>{total}</dd>
        </div>
        <div>
          <dt>{zh ? "精选" : "Featured"}</dt>
          <dd>{featured}</dd>
        </div>
      </dl>
    </header>
  );
}
