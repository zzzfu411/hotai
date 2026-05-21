import { prisma } from "@/lib/db";
import { HotList } from "@/components/HotList";
import { SearchBox } from "@/components/SearchBox";
import { toCard } from "@/lib/article";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Search",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string; sort?: string };
}) {
  const q = (searchParams.q ?? "").trim();
  const sort = searchParams.sort === "recent" ? "recent" : "hot";

  const articles =
    q.length > 0
      ? await prisma.article.findMany({
          where: {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { summary: { contains: q, mode: "insensitive" } },
              { aiSummaryEn: { contains: q, mode: "insensitive" } },
              { aiSummaryZh: { contains: q } },
              { aiTopics: { has: q.toLowerCase() } },
              { tags: { has: q.toLowerCase() } },
            ],
          },
          orderBy:
            sort === "recent"
              ? [{ publishedAt: "desc" }]
              : [{ score: "desc" }, { publishedAt: "desc" }],
          take: 60,
          include: { source: { select: { slug: true, name: true } } },
        })
      : [];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <header className="flex flex-col gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-ember-700 dark:text-ember-200 font-semibold">
            Search
          </p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight">
            What are you looking for?
          </h1>
        </div>
        <SearchBox initialQuery={q} initialSort={sort} />
      </header>

      {q.length > 0 && (
        <p className="mt-6 text-sm text-ink-500">
          {articles.length} result{articles.length === 1 ? "" : "s"} for{" "}
          <span className="font-semibold text-ink-700 dark:text-ink-200">&ldquo;{q}&rdquo;</span>
        </p>
      )}

      <section className="mt-4 card-surface px-4 sm:px-6 py-2 sm:py-3">
        <HotList articles={articles.map(toCard)} showRank={false} />
      </section>
    </div>
  );
}
