import { prisma, runDigestGeneration, startOfUtcDay } from "@hotai/db";
import { AI_DIGEST_ENABLED, AI_ENABLED, generateDigest } from "@hotai/ai";
import { config } from "./config.js";

/** The fetcher rewrites today's brief at most this often. */
const REFRESH_MS = 6 * 3600 * 1000;

/**
 * Generate (or refresh) the digest row for today (UTC day) from its
 * top-scored stories. Returns true when a new brief was written.
 */
export async function ensureTodayDigest(opts: { force?: boolean } = {}): Promise<boolean> {
  if (!AI_ENABLED || !AI_DIGEST_ENABLED) return false;
  const today = startOfUtcDay();
  const fresh = (row: { createdAt: Date }) => !opts.force && Date.now() - row.createdAt.getTime() < REFRESH_MS;

  if (!opts.force) {
    const existing = await prisma.digest.findUnique({ where: { date: today } });
    if (existing && fresh(existing)) return false;
  }

  const run = await runDigestGeneration({
    day: today,
    leaseMs: config.digestLeaseMs,
    keep: fresh,
    generate: generateDigest,
  });
  const day = today.toISOString().slice(0, 10);
  switch (run.status) {
    case "skipped":
      console.log(`[ai] digest skipped — only ${run.articles} article(s) on ${day}`);
      return false;
    case "busy":
      console.log(`[ai] digest skipped — another worker owns generation until ${run.leaseUntil.toISOString()}`);
      return false;
    case "saved":
      console.log(`[ai] digest generated for ${day} — ${(run.row.bullets as unknown[]).length} bullets`);
      return true;
    default:
      return false;
  }
}
