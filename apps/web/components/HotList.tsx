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
    <div className="ha-feed-list" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <article key={i} className="ha-card ha-article ha-article-skeleton">
          <div className="ha-article-body">
            <div className="skeleton ha-skeleton-line ha-skeleton-line-title" />
            <div className="skeleton ha-skeleton-line" />
            <div className="ha-skeleton-meta">
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
