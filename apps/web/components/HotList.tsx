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
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 py-4 border-b border-ink-200/60 dark:border-ink-800/60">
          <div className="w-8 h-6 skeleton" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-4/5 skeleton" />
            <div className="h-3 w-full skeleton" />
            <div className="flex gap-2">
              <div className="h-3 w-20 skeleton" />
              <div className="h-3 w-16 skeleton" />
              <div className="h-3 w-12 skeleton" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
