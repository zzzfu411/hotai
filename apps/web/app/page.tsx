import { Suspense } from "react";
import type { Metadata } from "next";
import { NookFeed } from "@/components/NookFeed";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "速闻",
  description: "多源新闻按时间混排，站内阅读。Hot AI 热榜在「热榜」模块。",
};

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="kz-nook">
          <header className="kz-nook-head">
            <div className="kz-nook-title-block">
              <p className="kz-signal-eyebrow">
                <span className="kz-live-dot" aria-hidden />
                LIVE · AI 信号编辑部
              </p>
              <h1 className="kz-feed-title"><span aria-hidden>00/</span>综合</h1>
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
  );
}
