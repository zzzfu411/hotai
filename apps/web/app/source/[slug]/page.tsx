import { notFound } from "next/navigation";
import { FeedList } from "@/components/FeedList";
import { toCard } from "@/lib/article";
import { CATEGORIES } from "@/lib/constants";
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
  const cat = CATEGORIES.find((c) => c.slug === source.category);
  const host = source.homepage
    ? source.homepage.replace(/^https?:\/\//, "").replace(/\/$/, "")
    : "";

  return (
    <div className="kz-page">
      <FeedList
        articles={articles}
        ranked={false}
        kickerZh={`${cat?.label_zh ?? source.category} · ${source.lang} · 权重 ${source.weight}`}
        kickerEn={`${cat?.label_en ?? source.category} · ${source.lang} · weight ${source.weight}`}
        titleZh={source.name}
        titleEn={source.name}
        action={
          source.homepage ? (
            <a
              href={source.homepage}
              target="_blank"
              rel="noopener noreferrer"
              className="kz-chip"
            >
              {host} ↗
            </a>
          ) : null
        }
      />
    </div>
  );
}
