import type { DigestBullet } from "@hotai/ai";
import { safeHttpUrl } from "./safe-url";

/** Attach current Article IDs to legacy URL-only digest rows when possible. */
export function linkDigestBullets(
  bullets: DigestBullet[],
  articles: Array<{ id: number; url: string }>,
): DigestBullet[] {
  const idsByUrl = new Map<string, number>();
  for (const article of articles) {
    const url = safeHttpUrl(article.url);
    if (url && Number.isInteger(article.id) && article.id > 0) idsByUrl.set(url, article.id);
  }
  return bullets.map((bullet) => {
    const ids = [
      ...(bullet.articleIds ?? []),
      ...bullet.urls.map((url) => idsByUrl.get(url)).filter((id): id is number => id != null),
    ];
    const articleIds = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))].slice(0, 4);
    return articleIds.length > 0 ? { ...bullet, articleIds } : bullet;
  });
}
