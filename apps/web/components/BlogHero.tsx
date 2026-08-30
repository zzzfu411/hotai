"use client";

import { useLang } from "./LangContext";

export function BlogHero({ total, featured }: { total: number; featured: number }) {
  const { lang } = useLang();
  const zh = lang === "zh";

  return (
    <header className="kz-card kz-blog-hero">
      <p className="kz-page-kicker">{zh ? "精选目录 · 长期收录" : "Curated · evergreen"}</p>
      <h1 className="kz-page-title">
        {zh ? "AI 领域值得长期订阅的博客" : "High-signal blogs from people who build AI"}
      </h1>
      <p className="kz-page-lede">
        {zh
          ? "不是新闻热榜，而是编辑精选的研究员与从业者博客。每张卡片都有「食用指南」：更新节奏、怎么读、内容时间线、推荐从哪篇开始。与 14 天热度文章分开，这里永久收录。"
          : "Not the hourly heat list — an editorial shortlist of researcher and practitioner blogs. Every card has a reading guide: cadence, how to read, content timeline, and where to start. Permanent; outside the 14-day news window."}
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
