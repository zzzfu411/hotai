import type { Metadata } from "next";
import { AI_ENABLED } from "@hotai/ai";
import { FeedList } from "@/components/FeedList";
import { PulseRail } from "@/components/PulseRail";
import { toCard } from "@/lib/article";
import { getHomeStats, getTodayDigestRow, getTopArticles } from "@/lib/queries";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "可信度热榜",
  description: "同一份 LAMDA briefing corpus 的最近 14 天可信度排名。",
};

/** Hot AI module: ranked board + digest pulse. Not the default homepage. */
export default async function HotPage() {
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
    const msg = err instanceof Error ? err.message : String(err);
    dbError = msg.includes("DATABASE_URL")
      ? "未读到 DATABASE_URL。把仓库根目录 .env 配好后重启 pnpm dev:web（Next 从 apps/web 启动，以前读不到根目录环境变量）。"
      : "数据库暂时连不上。简报需要 Postgres，请稍后再试。";
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
    <div className="ha-home">
      <h1 className="sr-only">LAMDA trusted ranking</h1>
      {dbError ? (
        <div className="ha-card ha-feed-empty" style={{ margin: 16 }}>
          <p className="font-bold">可信度热榜需要 Postgres</p>
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
          <div className="ha-home-feed">
            <FeedList
              articles={articles}
              ranked
              titleAs="h2"
              kickerZh="LAMDA briefing · 最近 14 天 · 可信度排名"
              kickerEn="LAMDA briefing · last 14 days · trusted ranking"
              titleZh="近 14 天可信度热榜"
              titleEn="Trusted ranking · last 14 days"
            />
          </div>
        </>
      )}
    </div>
  );
}
