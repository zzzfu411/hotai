import type { Source } from "@hotai/db";
import { prisma } from "@hotai/db";
import { AI_ENABLED } from "@hotai/ai";
import { fetchSource } from "./dispatch.js";
import { persistItems, type PersistStats } from "./store.js";
import { enrichPendingArticles } from "./enrich.js";
import { ensureTodayDigest } from "./digest.js";
import {
  purgeExpiredRateLimitBuckets,
  purgeOldArticles,
  purgeOldAskQuota,
  purgeOldCoordinationLeases,
  purgeStaleAskCache,
} from "./purge.js";
import { rescoreAllArticles } from "./rescore.js";
import { recordFetchSuccess, recordFetchFailure } from "./sourceHealth.js";
import { config } from "./config.js";
import { mapPool } from "./pool.js";
import type { RawItem } from "./types.js";
import { runWithFetcherCycleLease } from "./cycle-lock.js";

export type CycleReport = {
  sources: { ok: number; failed: number; disabled: number };
  articles: PersistStats;
  enrich: { analyzed: number; skipped: number };
  purged: number;
  rescored: number;
  ms: number;
};

/**
 * One full pipeline pass:
 *
 *   purge → fetch each source → persist (dedupe + score) → AI enrich (batched,
 *   score write-back) → daily digest → ISR revalidate
 *
 * Purge runs first so we never spend AI quota or ranking work on articles
 * that are about to be deleted. Enrichment runs after fetch so importance is
 * scored with the fullest signal set of the cycle.
 */
export async function runCycle(): Promise<CycleReport | null> {
  const result = await runWithFetcherCycleLease(runCycleUnlocked);
  if (!result.acquired) {
    console.warn(
      `[fetcher] skip cross-process overlap — lease held until ${result.leaseUntil.toISOString()}`,
    );
    return null;
  }
  if (!result.leaseHealthy) {
    console.warn("[fetcher] cycle completed but lease health degraded; inspect database connectivity");
  }
  return result.value;
}

async function runCycleUnlocked(): Promise<CycleReport> {
  const started = Date.now();
  const report: CycleReport = {
    sources: { ok: 0, failed: 0, disabled: 0 },
    articles: { created: 0, refreshed: 0, merged: 0, failed: 0 },
    enrich: { analyzed: 0, skipped: 0 },
    purged: 0,
    rescored: 0,
    ms: 0,
  };

  // Retention pass first — never waste AI calls on content we're about to delete.
  report.purged = await purgeOldArticles().catch((e) => {
    console.warn("[purge] articles failed:", (e as Error).message);
    return 0;
  });
  await purgeStaleAskCache().catch((e) =>
    console.warn("[purge] ask-cache failed:", (e as Error).message),
  );
  await purgeOldAskQuota().catch((e) =>
    console.warn("[purge] ask-quota failed:", (e as Error).message),
  );
  await purgeExpiredRateLimitBuckets().catch((e) =>
    console.warn("[purge] rate-limit buckets failed:", (e as Error).message),
  );
  await purgeOldCoordinationLeases().catch((e) =>
    console.warn("[purge] coordination leases failed:", (e as Error).message),
  );

  const sources = await prisma.source.findMany({ where: { enabled: true } });
  console.log(
    `[fetcher] cycle start — ${sources.length} sources, concurrency=${config.fetchConcurrency}, ai=${AI_ENABLED ? "on" : "off"}`,
  );

  type FetchOutcome =
    | { src: Source; ok: true; items: RawItem[] }
    | { src: Source; ok: false; err: Error };

  const outcomes = await mapPool(sources, config.fetchConcurrency, async (src): Promise<FetchOutcome> => {
    try {
      console.log(`  → ${src.slug} (${src.type})`);
      const items = await fetchSource(src);
      if (items.length === 0 && src.type === "scrape") {
        // A list page that parses to zero items almost always means the
        // selectors rotted — treat it as a failure so health tracking sees it.
        throw new Error("scraper returned 0 items — selectors may be stale");
      }
      return { src, ok: true, items };
    } catch (err) {
      return { src, ok: false, err: err as Error };
    }
  });

  for (const out of outcomes) {
    if (!out.ok) {
      report.sources.failed++;
      const { fails, disabled } = await recordFetchFailure(out.src, out.err);
      if (disabled) {
        report.sources.disabled++;
        console.error(
          `    ✗ ${out.src.slug}: ${out.err.message} — ${fails} consecutive fails, SOURCE AUTO-DISABLED`,
        );
      } else {
        console.error(
          `    ✗ ${out.src.slug}: ${out.err.message} (fail ${fails}/${config.sourceFailThreshold})`,
        );
      }
      continue;
    }
    try {
      const stats = await persistItems(out.src, out.items);
      report.articles.created += stats.created;
      report.articles.refreshed += stats.refreshed;
      report.articles.merged += stats.merged;
      report.articles.failed += stats.failed;
      if (stats.failed > 0) {
        // A fetch that cannot persist one or more items is degraded, not
        // healthy. Do not clear consecutive-failure state or make the source
        // look green when the database silently rejected part of its payload.
        report.sources.failed++;
        const persistErr = new Error(`persist failed for ${stats.failed} item(s)`);
        const { fails, disabled } = await recordFetchFailure(out.src, persistErr);
        if (disabled) report.sources.disabled++;
        console.warn(
          `    ! ${out.src.slug}: ${out.items.length} items — ${stats.created} new, ${stats.refreshed} refreshed, ${stats.merged} merged, ${stats.failed} failed (source fail ${fails}/${config.sourceFailThreshold})`,
        );
      } else {
        report.sources.ok++;
        await recordFetchSuccess(out.src);
        console.log(
          `    ✓ ${out.src.slug}: ${out.items.length} items — ${stats.created} new, ${stats.refreshed} refreshed, ${stats.merged} merged`,
        );
      }
    } catch (err) {
      report.sources.failed++;
      const { fails, disabled } = await recordFetchFailure(out.src, err as Error);
      if (disabled) {
        report.sources.disabled++;
        console.error(
          `    ✗ ${out.src.slug}: ${(err as Error).message} — ${fails} consecutive fails, SOURCE AUTO-DISABLED`,
        );
      } else {
        console.error(
          `    ✗ ${out.src.slug}: ${(err as Error).message} (fail ${fails}/${config.sourceFailThreshold})`,
        );
      }
    }
  }

  const a = report.articles;
  console.log(
    `[fetcher] fetch done — ${report.sources.ok} ok, ${report.sources.failed} failed; ` +
      `${a.created} new, ${a.refreshed} refreshed, ${a.merged} merged, ${Date.now() - started}ms`,
  );

  report.rescored = await rescoreAllArticles().catch((e) => {
    console.warn("[rescore] failed:", (e as Error).message);
    return 0;
  });
  if (report.rescored) console.log(`[fetcher] rescored ${report.rescored} articles`);

  // AI pipeline runs AFTER fetch so we score with full signal first.
  if (AI_ENABLED) {
    try {
      report.enrich = await enrichPendingArticles();
      if (config.aiDigestEnabled) await ensureTodayDigest();
    } catch (err) {
      console.warn(`[ai] pipeline error:`, (err as Error).message);
    }
  }

  await notifyRevalidate();
  report.ms = Date.now() - started;
  console.log(`[fetcher] cycle total ${report.ms}ms`);
  return report;
}

async function notifyRevalidate(): Promise<void> {
  if (!config.revalidateUrl || !config.revalidateSecret) return;
  try {
    const res = await fetch(config.revalidateUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-revalidate-secret": config.revalidateSecret,
      },
      body: JSON.stringify({ paths: ["/", "/hot", "/digest", "/feed.xml", "/feed.json"] }),
      signal: AbortSignal.timeout(8_000),
    });
    console.log(`[fetcher] revalidate -> ${res.status}`);
  } catch (err) {
    console.warn(`[fetcher] revalidate failed:`, (err as Error).message);
  }
}
