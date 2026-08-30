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
          <p className="kz-page-kicker">速闻</p>
          <h1 className="kz-feed-title">综合</h1>
        </div>
      }
    >
      <NookFeed />
    </Suspense>
  );
}
