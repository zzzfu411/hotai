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
  searchParams: { q?: string; sort?: string };
}) {
  const q = (searchParams.q ?? "").trim();
  const sort = searchParams.sort === "recent" ? "recent" : "hot";

  const articles = q.length >= 2 ? await searchArticles(q, sort) : [];

  return (
    <div className="kz-page">
      <SearchBox
        initialQuery={q}
        initialSort={sort}
        resultCount={q.length > 0 ? articles.length : null}
      />
      {q.length > 0 && <FeedList articles={articles.map(toCard)} />}
    </div>
  );
}
