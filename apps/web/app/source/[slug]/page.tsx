import { serverLang } from "@/lib/server-lang";
import { notFound } from "next/navigation";
import { FeedList } from "@/components/FeedList";
import { toCard } from "@/lib/article";
import { CATEGORIES } from "@/lib/constants";
import { getArticlesBySource, getSourceBySlug } from "@/lib/queries";
import type { Metadata } from "next";
import { safeHttpUrl } from "@/lib/safe-url";
import { parsePage } from "@/lib/pagination";
import { Pagination } from "@/components/Pagination";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const s = await getSourceBySlug(slug).catch(() => null);
  if (!s) return {};
  return { title: `${s.name} · Hot AI` };
}

export default async function SourcePage({ params, searchParams }: PageProps) {
  const zh = (await serverLang()) === "zh";
  const page = parsePage((await searchParams).page);
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
      <div className="kz-page">
        <div className="kz-card kz-feed-empty">
          <p className="kz-feed-empty-title">{zh ? "来源暂时不可用" : "Source unavailable"}</p>
          <p className="kz-feed-empty-copy">{zh ? "内容服务暂时不可用，请稍后重试。" : "The content service is unavailable. Please retry shortly."}</p>
        </div>
      </div>
    );
  }
  if (!source) notFound();

  let articles: ReturnType<typeof toCard>[] = [];
  let unavailable = false;
  try {
    const rows = await getArticlesBySource(source.id, 81, (page - 1) * 80);
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
    <div className="kz-page">
      <FeedList
        articles={articles.slice(0, 80)}
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
              className="kz-chip"
            >
              {host} ↗
            </a>
          ) : null
        }
      />
      {!unavailable && <Pagination page={page} hasMore={articles.length > 80} path={`/source/${source.slug}`} />}
    </div>
  );
}
