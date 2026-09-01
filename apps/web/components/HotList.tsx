import { FeedList } from "./FeedList";
import type { ArticleCardData } from "./ArticleCard";

export function HotList({
  articles,
  showRank = false,
}: {
  articles: ArticleCardData[];
  showRank?: boolean;
}) {
  return <FeedList articles={articles} ranked={showRank} />;
}

export function HotListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="kz-feed-list" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <article key={i} className="kz-card kz-article kz-article-skeleton">
          <div className="kz-rank skeleton" />
          <div className="kz-article-body">
            <div className="skeleton kz-skeleton-line kz-skeleton-line-title" />
            <div className="skeleton kz-skeleton-line" />
            <div className="kz-skeleton-meta">
              <div className="skeleton" />
              <div className="skeleton" />
              <div className="skeleton" />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
