import { prisma } from "@hotai/db";
import { config } from "./config.js";

/**
 * Retention pass. Digest rows are kept indefinitely (tiny, and the only
 * LLM output that can't be regenerated once its articles are purged).
 */

/** Delete articles older than the retention window (project policy: 14 days). */
export async function purgeOldArticles(): Promise<number> {
  const cutoff = new Date(Date.now() - config.retentionDays * 24 * 3600 * 1000);
  const { count } = await prisma.article.deleteMany({
    where: { publishedAt: { lt: cutoff } },
  });
  if (count > 0) {
    console.log(`[purge] removed ${count} articles older than ${config.retentionDays}d`);
  }
  return count;
}

/** Drop /api/ask answer-cache rows past their TTL (web only reads fresh ones). */
export async function purgeStaleAskCache(): Promise<number> {
  const cutoff = new Date(Date.now() - config.askCacheTtlHours * 3600 * 1000);
  const { count } = await prisma.askCache.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  if (count > 0) {
    console.log(`[purge] removed ${count} stale ask-cache entries (>${config.askCacheTtlHours}h)`);
  }
  return count;
}
