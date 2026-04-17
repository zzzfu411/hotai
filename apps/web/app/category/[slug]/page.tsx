import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { HotList } from "@/components/HotList";
import { CATEGORIES, type CategorySlug } from "@/lib/constants";
import type { Metadata } from "next";

export const revalidate = 600;

export async function generateStaticParams() {
  return CATEGORIES.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const c = CATEGORIES.find((x) => x.slug === params.slug);
  if (!c) return {};
  return { title: `${c.label_en} · Hot AI` };
}

export default async function CategoryPage({ params }: { params: { slug: string } }) {
  const cat = CATEGORIES.find((c) => c.slug === params.slug);
  if (!cat) notFound();

  const rows = await prisma.article.findMany({
    where: { category: cat.slug as CategorySlug },
    orderBy: [{ score: "desc" }, { publishedAt: "desc" }],
    take: 80,
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
      <h1 className="text-2xl font-bold">{cat.label_en}</h1>
      <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">{articles.length} hot items</p>
      <div className="mt-4">
        <HotList articles={articles} />
      </div>
    </div>
  );
}
