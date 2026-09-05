import { notFound } from "next/navigation";
import { FeedList } from "@/components/FeedList";
import { CATEGORIES } from "@/lib/constants";
import { toCard } from "@/lib/article";
import { getCategoryArticles } from "@/lib/queries";
import type { Metadata } from "next";
import { parsePage } from "@/lib/pagination";
import { Pagination } from "@/components/Pagination";

export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  return CATEGORIES.map((c) => ({ slug: c.slug }));
}

type PageProps = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const c = CATEGORIES.find((x) => x.slug === slug);
  if (!c) return {};
  return { title: `${c.label_zh} · ${c.label_en}` };
}

export default async function CategoryPage({ params, searchParams }: PageProps) {
  const page = parsePage((await searchParams).page);
  const { slug } = await params;
  const cat = CATEGORIES.find((c) => c.slug === slug);
  if (!cat) notFound();

  let articles: ReturnType<typeof toCard>[] = [];
  let unavailable = false;
  try {
    const rows = await getCategoryArticles(cat.slug, 81, (page - 1) * 80);
    articles = rows.map(toCard);
  } catch (error) {
    unavailable = true;
    console.warn(
      `[category:${cat.slug}] database unavailable:`,
      error instanceof Error ? error.message : error,
    );
  }

  return (
    <div className="kz-page">
      <FeedList
        articles={articles.slice(0, 80)}
        ranked={false}
        kickerZh="分类 · 最近 14 天入库 · 按时间"
        kickerEn="Category · stored 14 days · chronological"
        titleZh={cat.label_zh}
        titleEn={cat.label_en}
        emptyTitleZh={unavailable ? "分类暂时不可用" : undefined}
        emptyTitleEn={unavailable ? "Category temporarily unavailable" : undefined}
        emptyCopyZh={unavailable ? "内容服务暂时不可用，请稍后重试。" : undefined}
        emptyCopyEn={unavailable ? "The content service is unavailable. Please try again shortly." : undefined}
      />
      {!unavailable && <Pagination page={page} hasMore={articles.length > 80} path={`/category/${cat.slug}`} />}
    </div>
  );
}
