import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { HotList } from "@/components/HotList";
import { CATEGORIES, type CategorySlug } from "@/lib/constants";
import { toCard } from "@/lib/article";
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

  const articles = rows.map(toCard);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-ember-700 dark:text-ember-200 font-semibold">
            Category
          </p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight">{cat.label_en}</h1>
        </div>
        <p className="text-sm text-ink-500 tabular-nums">{articles.length} items</p>
      </header>
      <section className="mt-6 card-surface px-4 sm:px-6 py-2 sm:py-3">
        <HotList articles={articles} />
      </section>
    </div>
  );
}
