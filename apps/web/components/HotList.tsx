import { ArticleCard, type ArticleCardData } from "./ArticleCard";

export function HotList({
  articles,
  showRank = true,
}: {
  articles: ArticleCardData[];
  showRank?: boolean;
}) {
  if (articles.length === 0) {
    return (
      <div className="card-surface py-12 text-center text-sm text-ink-600 dark:text-ink-300">
        <div className="inline-block mb-3 w-10 h-10 rounded-full fire-gradient opacity-60 animate-pulse-flame" />
        <p className="font-medium">No articles yet</p>
        <p className="mt-1 text-xs text-ink-500">The fetcher may still be warming up. Refresh in a minute.</p>
      </div>
    );
  }
  return (
    <div className="divide-y divide-transparent">
      {articles.map((a, i) => (
        <ArticleCard key={a.id} a={{ ...a, rank: showRank ? i + 1 : undefined }} />
      ))}
    </div>
  );
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
