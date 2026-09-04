import type { Source } from "@hotai/db";
import { BRIEFING_SOURCE_SLUGS, prisma } from "@hotai/db";
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
import { recordFetchSuccess, recordFetchDegraded, recordFetchFailure } from "./sourceHealth.js";
import { config } from "./config.js";
import { mapPool } from "./pool.js";
import type { RawItem } from "./types.js";
import { runWithFetcherCycleLease } from "./cycle-lock.js";
import { assessEnabledSources, assessSourceContent } from "./content-quality.js";

export type CycleReport = {
  status: "ok" | "degraded";
  errors: string[];
  sources: { ok: number; degraded: number; failed: number; disabled: number };
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
  const result = await runWithFetcherCycleLease(runCycleUnlocked, {
    status: (report) => (report.status === "ok" ? "success" : "degraded"),
  });
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
    status: "ok",
    errors: [],
    sources: { ok: 0, degraded: 0, failed: 0, disabled: 0 },
    articles: {
      created: 0,
      refreshed: 0,
      merged: 0,
      accepted: 0,
      discarded: 0,
      discardedInvalid: 0,
      discardedOutsideWindow: 0,
      discardedDuplicate: 0,
      failed: 0,
    },
    enrich: { analyzed: 0, skipped: 0 },
    purged: 0,
    rescored: 0,
    ms: 0,
  };

  // Retention pass first — never waste AI calls on content we're about to delete.
  report.purged = await purgeOldArticles().catch((e) => {
    note(report, "purge articles", e);
    return 0;
  });
  await purgeStaleAskCache().catch((e) =>
    note(report, "purge ask-cache", e),
  );
  await purgeOldAskQuota().catch((e) =>
    note(report, "purge ask-quota", e),
  );
  await purgeExpiredRateLimitBuckets().catch((e) =>
    note(report, "purge rate-limit buckets", e),
  );
  await purgeOldCoordinationLeases().catch((e) =>
    note(report, "purge coordination leases", e),
  );

  const sources = await prisma.source.findMany({
    where: { enabled: true, slug: { in: [...BRIEFING_SOURCE_SLUGS] } },
  });
  const sourceSet = assessEnabledSources(sources.length);
  if (sourceSet.status === "degraded") note(report, "sources", sourceSet.reason);
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
      if (!Array.isArray(items)) throw new Error(`${src.type} source returned a non-array payload`);
      if (items.length === 0) {
        // An empty payload from any adapter is not evidence of a healthy feed:
        // it can mean a broken selector, an API contract change, or an
        // upstream outage returning an empty fallback.
        throw new Error(`${src.type} source returned 0 items`);
      }
      return { src, ok: true, items };
    } catch (err) {
      return { src, ok: false, err: err as Error };
    }
  });

  for (const out of outcomes) {
    if (!out.ok) {
      report.sources.failed++;
      note(report, `source ${out.src.slug}`, out.err);
      const { fails, disabled } = await recordFailureHealth(report, out.src, out.err);
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
      report.articles.accepted += stats.accepted;
      report.articles.discarded += stats.discarded;
      report.articles.discardedInvalid += stats.discardedInvalid;
      report.articles.discardedOutsideWindow += stats.discardedOutsideWindow;
      report.articles.discardedDuplicate += stats.discardedDuplicate;
      report.articles.failed += stats.failed;
      const assessment = assessSourceContent(out.items.length, stats);
      if (assessment.status === "failed") {
        // A fetch that cannot persist one or more items is a hard source
        // failure. Do not clear consecutive-failure state or make the source
        // look green when the database silently rejected part of its payload.
        report.sources.failed++;
        const persistErr = new Error(assessment.reason ?? "source content failed validation");
        note(report, `source ${out.src.slug} persistence`, persistErr);
        const { fails, disabled } = await recordFailureHealth(report, out.src, persistErr);
        if (disabled) report.sources.disabled++;
        console.warn(
          `    ! ${out.src.slug}: ${out.items.length} items — ${assessment.reason} (source fail ${fails}/${config.sourceFailThreshold})`,
        );
      } else {
        if (assessment.status === "degraded") {
          report.sources.degraded++;
          note(report, `source ${out.src.slug} content`, assessment.reason);
          await recordFetchDegraded(out.src, assessment.reason ?? "source content degraded").catch((error) =>
            note(report, `source ${out.src.slug} health`, error),
          );
        } else {
          report.sources.ok++;
          await recordFetchSuccess(out.src).catch((error) =>
            note(report, `source ${out.src.slug} health`, error),
          );
        }
        console.log(
          `    ✓ ${out.src.slug}: ${out.items.length} items — ${stats.created} new, ${stats.refreshed} refreshed, ${stats.merged} merged, ${stats.discarded} discarded`,
        );
      }
    } catch (err) {
      report.sources.failed++;
      note(report, `source ${out.src.slug} persistence`, err);
      const { fails, disabled } = await recordFailureHealth(report, out.src, err);
      if (disabled) {
        report.sources.disabled++;
        console.error(
          `    ✗ ${out.src.slug}: ${errorMessage(err)} — ${fails} consecutive fails, SOURCE AUTO-DISABLED`,
        );
      } else {
        console.error(
          `    ✗ ${out.src.slug}: ${errorMessage(err)} (fail ${fails}/${config.sourceFailThreshold})`,
        );
      }
    }
  }

  const a = report.articles;
  console.log(
    `[fetcher] fetch done — ${report.sources.ok} ok, ${report.sources.degraded} degraded, ${report.sources.failed} failed; ` +
      `${a.created} new, ${a.refreshed} refreshed, ${a.merged} merged, ` +
      `${a.accepted} accepted, ${a.discarded} discarded (${a.failed} persist failures), ${Date.now() - started}ms`,
  );

  report.rescored = await rescoreAllArticles().catch((e) => {
    note(report, "rescore", e);
    return 0;
  });
  if (report.rescored) console.log(`[fetcher] rescored ${report.rescored} articles`);

  // AI pipeline runs AFTER fetch so we score with full signal first.
  if (AI_ENABLED) {
    try {
      report.enrich = await enrichPendingArticles();
      if (config.aiDigestEnabled) await ensureTodayDigest();
    } catch (err) {
      note(report, "ai pipeline", err);
    }
  }

  const revalidateError = await notifyRevalidate();
  if (revalidateError) note(report, "revalidate", revalidateError);
  if (report.sources.failed > 0 || report.sources.degraded > 0) report.status = "degraded";
  report.ms = Date.now() - started;
  console.log(`[fetcher] cycle total ${report.ms}ms (${report.status})`);
  return report;
}

async function notifyRevalidate(): Promise<string | null> {
  if (!config.revalidateUrl || !config.revalidateSecret) return null;
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
    if (!res.ok) return `revalidate endpoint returned HTTP ${res.status}`;
    console.log(`[fetcher] revalidate -> ${res.status}`);
    return null;
  } catch (err) {
    return errorMessage(err);
  }
}

function note(report: CycleReport, stage: string, error: unknown): void {
  report.status = "degraded";
  report.errors.push(`${stage}: ${errorMessage(error)}`);
  console.warn(`[${stage}] failed:`, errorMessage(error));
}

async function recordFailureHealth(
  report: CycleReport,
  source: Source,
  error: unknown,
): Promise<{ fails: number; disabled: boolean }> {
  const result = await recordFetchFailure(source, error);
  if (!result.persisted) {
    note(report, `source ${source.slug} health`, "health state was not fully persisted or confirmed");
  }
  return result;
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 300);
}
