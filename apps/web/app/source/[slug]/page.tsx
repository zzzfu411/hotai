import { notFound } from "next/navigation";
import { FeedList } from "@/components/FeedList";
import { toCard } from "@/lib/article";
import { CATEGORIES } from "@/lib/constants";
import { getArticlesBySource, getSourceBySlug } from "@/lib/queries";
import type { Metadata } from "next";
import { safeHttpUrl } from "@/lib/safe-url";

export const revalidate = 600;

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const s = await getSourceBySlug(slug);
  if (!s) return {};
  return { title: `${s.name} · Hot AI` };
}

export default async function SourcePage({ params }: PageProps) {
  const { slug } = await params;
  const source = await getSourceBySlug(slug);
  if (!source) notFound();

  const rows = await getArticlesBySource(source.id);
  const articles = rows.map(toCard);
  const cat = CATEGORIES.find((c) => c.slug === source.category);
  const homepage = safeHttpUrl(source.homepage);
  const host = homepage
    ? homepage.replace(/^https?:\/\//, "").replace(/\/$/, "")
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
          homepage ? (
            <a
              href={homepage}
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
