import { prisma } from "@hotai/db";
import { config } from "./config.js";

/**
 * Delete articles older than the retention window.
 * Digest rows are kept indefinitely (they're tiny and useful for historical browsing).
 * Runs cheaply — Postgres can handle a 14d-old DELETE without pain even at our scale.
 */
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
