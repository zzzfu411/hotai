import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { FeedList } from "@/components/FeedList";
import { ReaderBody, ReadingFlags } from "@/components/Reader";
import { parseArticleId, parseCrossPosts, toCard } from "@/lib/article";
import { CATEGORIES, SITE } from "@/lib/constants";
import { formatUtcDateTime, hostname } from "@/lib/format";
import { getArticleById, getRelatedArticles } from "@/lib/queries";
import { safeHttpUrl } from "@/lib/safe-url";

export const revalidate = 600;

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const id = parseArticleId((await params).id);
  if (id == null) return {};
  const a = await getArticleById(id);
  if (!a) return {};
  const description = a.aiSummaryZh || a.aiSummaryEn || a.summary || a.title;
  const url = `${SITE.url}/a/${a.id}`;
  return {
    title: a.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      title: a.title,
      description,
      url,
      publishedTime: a.publishedAt.toISOString(),
    },
  };
}

export default async function ArticlePage({ params }: PageProps) {
  const id = parseArticleId((await params).id);
  if (id == null) notFound();

  const article = await getArticleById(id);
  if (!article) notFound();
  const articleUrl = safeHttpUrl(article.url);
  if (!articleUrl) notFound();

  const related = await getRelatedArticles(article.aiTopics, article.id, 5);

  const crossPosts = parseCrossPosts(article.crossPosts);
  const publishedIso = article.publishedAt.toISOString();
  const cat = CATEGORIES.find((c) => c.slug === article.category);
  const fallbackSummary =
    article.aiSummaryZh || article.aiSummaryEn || article.summary || "";
  const importancePct =
    article.aiImportance != null && Number.isFinite(article.aiImportance)
      ? Math.round(Math.min(1, Math.max(0, article.aiImportance)) * 100)
      : null;
  const host = hostname(articleUrl);
  const hasAiSummaries = Boolean(article.aiSummaryZh || article.aiSummaryEn);

  return (
    <article className="kz-reader">
      <header className="kz-reader-head">
        <p className="kz-reader-kicker">
          <Link href={`/source/${article.source.slug}`}>{article.source.name}</Link>
          {cat ? (
            <>
              <span aria-hidden> · </span>
              <Link href={`/category/${cat.slug}`}>{cat.label_zh}</Link>
            </>
          ) : null}
        </p>
        <h1 className="kz-reader-title">{article.title}</h1>
        <div className="kz-reader-meta">
          <time dateTime={publishedIso}>{formatUtcDateTime(article.publishedAt)}</time>
          <a
            href={articleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="kz-chip kz-host"
            title="打开原文"
          >
            {host}
          </a>
          {importancePct != null ? (
            <span className="kz-chip font-mono tabular-nums">重要度 {importancePct}</span>
          ) : null}
          {article.aiTopics.map((t) => (
            <Link key={t} href={`/search?q=${encodeURIComponent(t)}`} className="kz-chip">
              {t}
            </Link>
          ))}
        </div>
        <div className="kz-reader-toolbar">
          <a className="kz-btn" href={articleUrl} target="_blank" rel="noopener noreferrer">
            打开原文
          </a>
          <ReadingFlags id={article.id} />
        </div>
      </header>

      {hasAiSummaries || article.summary ? (
        <div className="kz-reader-summaries">
          {article.aiSummaryZh ? (
            <section className="kz-card kz-reader-summary" lang="zh">
              <h2>中文摘要</h2>
              <p>{article.aiSummaryZh}</p>
            </section>
          ) : null}
          {article.aiSummaryEn ? (
            <section className="kz-card kz-reader-summary" lang="en">
              <h2>English</h2>
              <p>{article.aiSummaryEn}</p>
            </section>
          ) : null}
          {!hasAiSummaries && article.summary ? (
            <section className="kz-card kz-reader-summary">
              <h2>摘要</h2>
              <p>{article.summary}</p>
            </section>
          ) : null}
        </div>
      ) : null}

      {crossPosts.length > 0 ? (
        <div className="kz-reader-cross">
          <span className="kz-reader-cross-label">转载</span>
          {crossPosts.map((c) => (
            <a
              key={c.url}
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              className="kz-chip"
            >
              {c.source}
            </a>
          ))}
        </div>
      ) : null}

      <div className="kz-reader-body">
        <ReaderBody url={articleUrl} fallbackSummary={fallbackSummary} />
      </div>

      {related.length > 0 ? (
        <div className="kz-reader-related">
          <FeedList
            articles={related.map(toCard)}
            titleZh="相关文章"
            titleEn="Related"
            titleAs="h2"
          />
        </div>
      ) : null}
    </article>
  );
}
