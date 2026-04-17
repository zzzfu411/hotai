import { ArticleCard, type ArticleCardData } from "./ArticleCard";

export function HotList({ articles, showRank = true }: { articles: ArticleCardData[]; showRank?: boolean }) {
  if (articles.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-ink-600 dark:text-ink-300">
        No articles yet. The fetcher may still be running.
      </div>
    );
  }
  return (
    <div>
      {articles.map((a, i) => (
        <ArticleCard key={a.id} a={{ ...a, rank: showRank ? i + 1 : undefined }} />
      ))}
    </div>
  );
}
