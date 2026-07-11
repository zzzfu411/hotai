import { notFound } from "next/navigation";
import { HotList } from "@/components/HotList";
import { toCard } from "@/lib/article";
import { getArticlesBySource, getSourceBySlug } from "@/lib/queries";
import type { Metadata } from "next";

export const revalidate = 600;

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const s = await getSourceBySlug(params.slug);
  if (!s) return {};
  return { title: `${s.name} · Hot AI` };
}

export default async function SourcePage({ params }: { params: { slug: string } }) {
  const source = await getSourceBySlug(params.slug);
  if (!source) notFound();

  const rows = await getArticlesBySource(source.id);

  const articles = rows.map(toCard);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-ember-700 dark:text-ember-200 font-semibold">
            {source.category} · {source.lang} · weight {source.weight}
          </p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight">{source.name}</h1>
        </div>
        {source.homepage && (
          <a
            href={source.homepage}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-accent hover:underline break-all"
          >
            {source.homepage.replace(/^https?:\/\//, "")} ↗
          </a>
        )}
      </header>
      <section className="mt-6 card-surface px-4 sm:px-6 py-2 sm:py-3">
        <HotList articles={articles} showRank={false} />
      </section>
    </div>
  );
}
