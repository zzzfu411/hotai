import type { Metadata } from "next";
import Link from "next/link";
import { FeedList } from "@/components/FeedList";
import { toCard } from "@/lib/article";
import { getHomeArticles } from "@/lib/queries";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "LAMDA AI Briefing",
  description: "给 Ria 的私有 AI 研究简报：论文、实验室更新与值得慢读的技术工作。",
};

export default async function HomePage() {
  let articles: Awaited<ReturnType<typeof getHomeArticles>>["articles"] = [];
  let scope: Awaited<ReturnType<typeof getHomeArticles>>["scope"] = "today";
  let dbError: string | null = null;
  try {
    const briefing = await getHomeArticles(40);
    articles = briefing.articles;
    scope = briefing.scope;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    dbError = msg.includes("DATABASE_URL")
      ? "未读到 DATABASE_URL。配置数据库后重新打开简报。"
      : "数据库暂时不可用。稍后重新打开简报。";
  }

  const today = scope === "today";

  return (
    <div className="ha-briefing-home">
      <header className="ha-home-head">
        <p className="ha-page-kicker">PRIVATE AI BRIEFING · FOR RIA</p>
        <h1 className="ha-page-title">LAMDA AI Briefing</h1>
        <p className="ha-page-lede">
          论文与实验室更新的安静案头简报。按今天的阅读顺序收拢，必要时回看保留窗口内的研究。
        </p>
        <Link className="ha-home-journal" href="/juya">
          橘鸦早报 / Juya daily
        </Link>
      </header>
      {dbError ? (
        <div className="ha-card ha-feed-empty">
          <p className="ha-feed-empty-title">简报暂时不可用</p>
          <p className="ha-feed-empty-copy">{dbError}</p>
        </div>
      ) : (
        <FeedList
          articles={articles.map(toCard)}
          titleAs="h2"
          kickerZh={today ? "今日阅读" : "保留窗口"}
          kickerEn={today ? "Today's reading" : "Retained corpus"}
          titleZh={today ? "研究与实验室更新" : "最近的研究与实验室更新"}
          titleEn={today ? "Research and lab updates" : "Recent research and lab updates"}
          emptyTitleZh="简报预热中"
          emptyTitleEn="Briefing warming"
          emptyCopyZh="还没有论文或实验室更新入库；抓取器写入第一批条目后，这里会出现今天的阅读。"
          emptyCopyEn="No papers or lab updates have landed yet. The first fetch will open today's reading list."
        />
      )}
    </div>
  );
}
