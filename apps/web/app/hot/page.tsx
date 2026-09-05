import { serverLang } from "@/lib/server-lang";
import type { Metadata } from "next";
import { AI_ENABLED } from "@hotai/ai";
import { FeedList } from "@/components/FeedList";
import { PulseRail } from "@/components/PulseRail";
import { toCard } from "@/lib/article";
import { getHomeStats, getTodayDigestRow, getTopArticles } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "热榜",
  description: "Hot AI 模块：按重要度排序的最近 14 天入库 AI 热榜。",
};

/** Hot AI module: ranked board + digest pulse. Not the default homepage. */
export default async function HotPage() {
  const zh = (await serverLang()) === "zh";
  let articles: ReturnType<typeof toCard>[] = [];
  let digest: Awaited<ReturnType<typeof getTodayDigestRow>> = null;
  let stats = { enabledSources: 0, articles24h: 0, lastFetch: null as Date | null };
  let dbError: string | null = null;

  try {
    const [rows, homeStats, digestRow] = await Promise.all([
      getTopArticles(50),
      getHomeStats(),
      getTodayDigestRow(),
    ]);
    articles = rows.map(toCard);
    stats = homeStats;
    digest = digestRow;
  } catch (err) {
    console.warn("[hot] content unavailable:", err instanceof Error ? err.message : "database error");
    dbError = zh ? "内容服务暂时不可用，请稍后重试。已有的本机阅读记录仍可在「我的」查看。" : "The content service is unavailable. Please retry shortly. Your reading list is still available in Mine.";
  }

  const lastFetch = stats.lastFetch
    ? new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "UTC",
      }).format(stats.lastFetch) + " UTC"
    : "—";

  return (
    <div className="kz-home">
      <h1 className="sr-only">Hot AI</h1>
      {dbError ? (
        <div className="kz-card kz-feed-empty" style={{ margin: 16 }}>
          <p className="font-bold">{zh ? "热榜暂时不可用" : "Hot list unavailable"}</p>
          <p>{dbError}</p>
        </div>
      ) : (
        <>
          <PulseRail
            aiEnabled={AI_ENABLED}
            digest={
              digest
                ? {
                    headline: digest.headline,
                    overview: digest.overview,
                    themes: digest.themes,
                  }
                : null
            }
            stats={{
              enabledSources: stats.enabledSources,
              articles24h: stats.articles24h,
              lastFetch,
            }}
          />
          <div className="kz-home-feed">
            <FeedList
              articles={articles}
              ranked
              titleAs="h2"
              kickerZh="Hot AI 模块 · 最近 14 天入库 · 按重要度"
              kickerEn="Hot AI module · last 14 days · ranked"
              titleZh="近 14 天热榜"
              titleEn="Hot list · last 14 days"
            />
          </div>
        </>
      )}
    </div>
  );
}
