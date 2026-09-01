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

/** Keep only recent quota accounting; deleting a day cascades reservations. */
export async function purgeOldAskQuota(): Promise<number> {
  const cutoff = new Date();
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCDate(cutoff.getUTCDate() - 32);
  const { count } = await prisma.askDailyUsage.deleteMany({ where: { day: { lt: cutoff } } });
  if (count > 0) console.log(`[purge] removed ${count} ask-quota day(s) older than 32d`);
  return count;
}

/** Remove expired shared endpoint counters; live windows remain untouched. */
export async function purgeExpiredRateLimitBuckets(now = new Date()): Promise<number> {
  const { count } = await prisma.rateLimitBucket.deleteMany({ where: { resetAt: { lte: now } } });
  if (count > 0) console.log(`[purge] removed ${count} expired rate-limit bucket(s)`);
  return count;
}

/** Keep the singleton fetcher record, but trim old per-day digest lease history. */
export async function purgeOldCoordinationLeases(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 32 * 24 * 3600 * 1000);
  const { count } = await prisma.coordinationLease.deleteMany({
    where: { name: { startsWith: "digest:" }, updatedAt: { lt: cutoff } },
  });
  if (count > 0) console.log(`[purge] removed ${count} old digest coordination lease(s)`);
  return count;
}
