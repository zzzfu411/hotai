import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { HotList } from "@/components/HotList";
import type { Metadata } from "next";

export const revalidate = 600;

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const s = await prisma.source.findUnique({ where: { slug: params.slug } });
  if (!s) return {};
  return { title: `${s.name} · Hot AI` };
}

export default async function SourcePage({ params }: { params: { slug: string } }) {
  const source = await prisma.source.findUnique({ where: { slug: params.slug } });
  if (!source) notFound();

  const rows = await prisma.article.findMany({
    where: { sourceId: source.id },
    orderBy: [{ publishedAt: "desc" }],
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
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold">{source.name}</h1>
        {source.homepage && (
          <a
            href={source.homepage}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-accent hover:underline"
          >
            {source.homepage.replace(/^https?:\/\//, "")}
          </a>
        )}
      </div>
      <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
        {source.category} · {source.lang} · weight {source.weight}
      </p>
      <div className="mt-4">
        <HotList articles={articles} showRank={false} />
      </div>
    </div>
  );
}
