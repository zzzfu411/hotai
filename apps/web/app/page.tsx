import { prisma } from "@/lib/db";
import { HotList } from "@/components/HotList";
import { Hero } from "@/components/Hero";
import { CATEGORIES } from "@/lib/constants";
import Link from "next/link";

export const revalidate = 600; // 10 min ISR

export default async function HomePage() {
  const rows = await prisma.article.findMany({
    orderBy: [{ score: "desc" }, { publishedAt: "desc" }],
    take: 50,
    include: { source: { select: { slug: true, name: true } } },
  });

  const articles = rows.map((a) => ({
    id: a.id,
    title: a.title,
    url: a.url,
    summary: a.summary,
    publishedAt: a.publishedAt.toISOString(),
    score: a.score,
    lang: a.lang,
    tags: a.tags,
    source: a.source,
  }));

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <Hero />
      <div className="mt-6 flex flex-wrap gap-2 text-xs">
        {CATEGORIES.map((c) => (
          <Link
            key={c.slug}
            href={`/category/${c.slug}`}
            className="px-2.5 py-1 rounded-full border border-ink-200 dark:border-ink-800 hover:border-accent hover:text-accent transition"
          >
            #{c.label_en}
          </Link>
        ))}
      </div>
      <section className="mt-4">
        <HotList articles={articles} />
      </section>
    </div>
  );
}
