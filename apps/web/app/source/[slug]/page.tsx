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
  const s = await getSourceBySlug(slug).catch(() => null);
  if (!s) return {};
  return { title: `${s.name} · Hot AI` };
}

export default async function SourcePage({ params }: PageProps) {
  const { slug } = await params;
  let source: Awaited<ReturnType<typeof getSourceBySlug>>;
  try {
    source = await getSourceBySlug(slug);
  } catch (error) {
    console.warn(
      `[source:${slug}] database unavailable:`,
      error instanceof Error ? error.message : error,
    );
    return (
      <div className="ha-page">
        <div className="ha-card ha-feed-empty">
          <p className="ha-feed-empty-title">来源暂时不可用 · Source unavailable</p>
          <p className="ha-feed-empty-copy">数据库连接失败；首页 briefing 稍后再试。</p>
        </div>
      </div>
    );
  }
  if (!source) notFound();

  let articles: ReturnType<typeof toCard>[] = [];
  let unavailable = false;
  try {
    const rows = await getArticlesBySource(source.id);
    articles = rows.map(toCard);
  } catch (error) {
    unavailable = true;
    console.warn(
      `[source:${slug}] article query unavailable:`,
      error instanceof Error ? error.message : error,
    );
  }
  const cat = CATEGORIES.find((c) => c.slug === source.category);
  const homepage = safeHttpUrl(source.homepage);
  const host = homepage
    ? homepage.replace(/^https?:\/\//, "").replace(/\/$/, "")
    : "";

  return (
    <div className="ha-page">
      <FeedList
        articles={articles}
        ranked={false}
        kickerZh={`${cat?.label_zh ?? source.category} · 最近 14 天入库 · ${source.lang} · 权重 ${source.weight}`}
        kickerEn={`${cat?.label_en ?? source.category} · stored 14 days · ${source.lang} · weight ${source.weight}`}
        titleZh={source.name}
        titleEn={source.name}
        emptyTitleZh={unavailable ? "来源文章暂时不可用" : undefined}
        emptyTitleEn={unavailable ? "Source stories temporarily unavailable" : undefined}
        emptyCopyZh={unavailable ? "数据库连接失败；可以稍后重试或访问来源主页。" : undefined}
        emptyCopyEn={unavailable ? "The database is unavailable; retry later or visit the source." : undefined}
        action={
          homepage ? (
            <a
              href={homepage}
              target="_blank"
              rel="noopener noreferrer"
              className="ha-chip"
            >
              {host} ↗
            </a>
          ) : null
        }
      />
    </div>
  );
}
