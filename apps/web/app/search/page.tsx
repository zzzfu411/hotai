import { FeedList } from "@/components/FeedList";
import { SearchBox } from "@/components/SearchBox";
import { toCard } from "@/lib/article";
import { searchArticles } from "@/lib/queries";
import type { Metadata } from "next";
import { parsePage } from "@/lib/pagination";
import { Pagination } from "@/components/Pagination";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "搜索",
  robots: { index: false, follow: true },
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; page?: string }>;
}) {
  const resolved = await searchParams;
  const q = (resolved.q ?? "").trim().slice(0, 80);
  const page = parsePage(resolved.page);
  const sort = resolved.sort === "recent" ? "recent" : "hot";

  let articles: Awaited<ReturnType<typeof searchArticles>> = [];
  let unavailable = false;

  if (q.length >= 2) {
    try {
      articles = await searchArticles(q, sort, 61, (page - 1) * 60);
    } catch (err) {
      unavailable = true;
      console.warn("[search] db unavailable:", err instanceof Error ? err.message : err);
    }
  }

  return (
    <div className="kz-page">
      <SearchBox
        initialQuery={q}
        initialSort={sort}
        resultCount={q.length >= 2 && !unavailable ? Math.min(60, articles.length) : null}
        unavailable={unavailable}
        queryTooShort={q.length > 0 && q.length < 2}
      />
      {q.length >= 2 && !unavailable && (
        <FeedList
          articles={articles.slice(0, 60).map(toCard)}
          emptyTitleZh="没有匹配的入库文章"
          emptyTitleEn="No stored articles match"
          emptyCopyZh="换一个关键词，或回到首页浏览实时速闻。"
          emptyCopyEn="Try another keyword, or return to the live feed for the latest items."
        />
      )}
      {!unavailable && q.length >= 2 && <Pagination page={page} hasMore={articles.length > 60} path="/search" query={{ q, sort }} />}
    </div>
  );
}
