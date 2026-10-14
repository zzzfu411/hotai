import { Suspense } from "react";
import type { Metadata } from "next";
import { NookFeed } from "@/components/NookFeed";
import { isCatalogCategoryId } from "@/lib/catalog";
import { initialNookSnapshot } from "@/lib/catalog-snapshot";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "速闻",
  description: "多源实时速闻，综合频道按编辑信号排序，分类频道按最新排序。支持站内阅读和本机稍后读。",
};

type PageProps = { searchParams: Promise<{ c?: string | string[] }> };

export default async function HomePage({ searchParams }: PageProps) {
  const rawC = (await searchParams).c;
  const c = Array.isArray(rawC) ? rawC[0] : rawC;
  // First screen from the server's feed cache; the browser refreshes it.
  const initial = initialNookSnapshot(isCatalogCategoryId(c) ? c : "mix");
  return (
    <>
      <Suspense
        fallback={
          <div className="kz-nook" aria-busy>
            <h1 className="sr-only">速闻 · 综合</h1>
            <div className="kz-nook-list" aria-hidden>
              <div className="kz-nook-skel kz-nook-lead" />
              <div className="kz-nook-skel" />
              <div className="kz-nook-skel" />
            </div>
          </div>
        }
      >
        <NookFeed initial={initial} />
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
