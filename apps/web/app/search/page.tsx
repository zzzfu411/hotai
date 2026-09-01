import { FeedList } from "@/components/FeedList";
import { SearchBox } from "@/components/SearchBox";
import { toCard } from "@/lib/article";
import { searchArticles } from "@/lib/queries";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "搜索",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string }>;
}) {
  const resolved = await searchParams;
  const q = (resolved.q ?? "").trim();
  const sort = resolved.sort === "recent" ? "recent" : "hot";

  let articles: Awaited<ReturnType<typeof searchArticles>> = [];
  let unavailable = false;

  if (q.length >= 2) {
    try {
      articles = await searchArticles(q, sort);
    } catch (err) {
      unavailable = true;
      console.warn("[search] db unavailable:", err instanceof Error ? err.message : err);
    }
  }

  return (
    <div className="ha-page">
      <SearchBox
        initialQuery={q}
        initialSort={sort}
        resultCount={q.length >= 2 && !unavailable ? articles.length : null}
        unavailable={unavailable}
        queryTooShort={q.length > 0 && q.length < 2}
      />
      {q.length >= 2 && !unavailable && (
        <FeedList
          articles={articles.map(toCard)}
          emptyTitleZh="没有匹配的入库文章"
          emptyTitleEn="No stored articles match"
          emptyCopyZh="换一个关键词，或回到首页继续阅读 briefing。"
          emptyCopyEn="Try another keyword, or return to the homepage briefing."
        />
      )}
    </div>
  );
}
