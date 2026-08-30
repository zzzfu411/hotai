import { notFound } from "next/navigation";
import { FeedList } from "@/components/FeedList";
import { CATEGORIES } from "@/lib/constants";
import { toCard } from "@/lib/article";
import { getCategoryArticles } from "@/lib/queries";
import type { Metadata } from "next";

export const revalidate = 600;

export async function generateStaticParams() {
  return CATEGORIES.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const c = CATEGORIES.find((x) => x.slug === params.slug);
  if (!c) return {};
  return { title: `${c.label_zh} · ${c.label_en}` };
}

export default async function CategoryPage({ params }: { params: { slug: string } }) {
  const cat = CATEGORIES.find((c) => c.slug === params.slug);
  if (!cat) notFound();

  const rows = await getCategoryArticles(cat.slug);
  const articles = rows.map(toCard);

  return (
    <div className="kz-page">
      <FeedList
        articles={articles}
        ranked={false}
        kickerZh="分类 · 按时间"
        kickerEn="Category · chronological"
        titleZh={cat.label_zh}
        titleEn={cat.label_en}
      />
    </div>
  );
}
