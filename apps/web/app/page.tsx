import { Suspense } from "react";
import type { Metadata } from "next";
import { NookFeed } from "@/components/NookFeed";
import {
  catalogCategoryNumber,
  getCatalogCategory,
  isCatalogCategoryId,
} from "@/lib/catalog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "速闻",
  description: "多源新闻按时间混排，站内阅读。Hot AI 热榜在「热榜」模块。",
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const rawC = (await searchParams).c;
  const category = isCatalogCategoryId(rawC) ? rawC : "mix";
  const cat = getCatalogCategory(category);
  const categoryNo = catalogCategoryNumber(category);

  return (
    <>
      <Suspense
        fallback={
          <div className="kz-nook">
            <header className="kz-nook-head">
              <div className="kz-nook-title-block">
                <p className="kz-signal-eyebrow">
                  <span className="kz-live-dot" aria-hidden />
                  LIVE · AI 信号编辑部
                </p>
                <h1 className="kz-feed-title">
                  <span aria-hidden>{categoryNo}/</span>
                  {cat.labelZh}
                </h1>
                <p className="kz-nook-deck">跨来源实时混排，用最短路径看见今天正在发生什么。</p>
              </div>
              <div className="kz-nook-console kz-nook-console-skeleton" aria-hidden>
                <span />
                <span />
                <span />
              </div>
            </header>
          </div>
        }
      >
        <NookFeed />
      </Suspense>
      <noscript>
        <div className="kz-card kz-noscript-fallback">
          <p className="kz-feed-empty-title">实时速闻需要 JavaScript · Live feed needs JavaScript</p>
          <p className="kz-feed-empty-copy">
            开启脚本后可读取多源实时 RSS；也可以先打开入库热榜，或导入自己的订阅源。
          </p>
          <div className="kz-digest-hosts">
            <a className="kz-chip" href="/hot">打开入库热榜 · Open hot list</a>
            <a className="kz-chip" href="/subscribe">管理订阅 · Subscriptions</a>
          </div>
        </div>
      </noscript>
    </>
  );
}
