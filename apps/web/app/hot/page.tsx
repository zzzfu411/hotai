import type { Metadata } from "next";
import { FeedList } from "@/components/FeedList";
import { toCard } from "@/lib/article";
import { getTopArticles } from "@/lib/queries";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "可信度热榜",
  description: "同一份 LAMDA briefing corpus 的最近 14 天可信度排名。",
};

/** Ranked briefing board. Titles lead; score stays muted metadata. */
export default async function HotPage() {
  let articles: ReturnType<typeof toCard>[] = [];
  let dbError: string | null = null;

  try {
    const rows = await getTopArticles(50);
    articles = rows.map(toCard);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    dbError = msg.includes("DATABASE_URL")
      ? "未读到 DATABASE_URL。把仓库根目录 .env 配好后重启 pnpm dev:web（Next 从 apps/web 启动，以前读不到根目录环境变量）。"
      : "数据库暂时连不上。简报需要 Postgres，请稍后再试。";
  }

  return (
    <div className="ha-page">
      {dbError ? (
        <div className="ha-card ha-feed-empty">
          <p className="ha-feed-empty-title">可信度热榜需要 Postgres</p>
          <p className="ha-feed-empty-copy">{dbError}</p>
        </div>
      ) : (
        <FeedList
          articles={articles}
          ranked
          titleAs="h1"
          kickerZh="LAMDA briefing · 最近 14 天 · 可信度排名"
          kickerEn="LAMDA briefing · last 14 days · trusted ranking"
          titleZh="近 14 天可信度热榜"
          titleEn="Trusted ranking · last 14 days"
          emptyTitleZh="热榜预热中"
          emptyTitleEn="Ranking warming"
          emptyCopyZh="还没有论文或 changelog 入库；抓取器写入第一批条目后，这里会按可信度列出。"
          emptyCopyEn="No papers or changelogs have landed yet. The first fetch will open the trusted ranking."
        />
      )}
    </div>
  );
}
