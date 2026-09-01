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
    <div className="kz-page">
      <SearchBox
        initialQuery={q}
        initialSort={sort}
        resultCount={q.length > 0 && !unavailable ? articles.length : null}
        unavailable={unavailable}
      />
      {q.length > 0 && !unavailable && <FeedList articles={articles.map(toCard)} />}
    </div>
  );
}
