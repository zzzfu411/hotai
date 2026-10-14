import { Suspense } from "react";
import type { Metadata } from "next";
import { NookFeed } from "@/components/NookFeed";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "速闻",
  description: "多源实时速闻，综合频道按编辑信号排序，分类频道按最新排序。支持站内阅读和本机稍后读。",
};

export default function HomePage() {
  return (
    <>
      <Suspense
        fallback={
          <div className="kz-nook" aria-busy>
            <header className="kz-nook-head">
              <div className="kz-nook-title-block">
                <h1 className="kz-feed-title">综合</h1>
                <p className="kz-nook-deck">跨来源实时混排，用最短路径看见今天正在发生什么。</p>
              </div>
            </header>
            <div className="kz-nook-list" aria-hidden>
              <div className="kz-card kz-nook-item kz-nook-lead kz-nook-skel" />
              <div className="kz-card kz-nook-item kz-nook-skel" />
              <div className="kz-card kz-nook-item kz-nook-skel" />
            </div>
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
          <div className="kz-sub-actions">
            <a className="kz-btn kz-btn-sm" href="/hot">打开入库热榜 · Open hot list</a>
            <a className="kz-btn kz-btn-sm" href="/subscribe">管理订阅 · Subscriptions</a>
          </div>
        </div>
      </noscript>
    </>
  );
}
