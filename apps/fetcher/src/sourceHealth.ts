import type { Source } from "@hotai/db";
import { prisma } from "@hotai/db";
import { config } from "./config.js";

/**
 * Per-source fetch health. Failures used to vanish into PM2 logs while a dead
 * feed kept burning cycles for weeks — now a source that fails
 * SOURCE_FAIL_THRESHOLD consecutive cycles is auto-disabled and the state is
 * queryable on the Source row (consecutiveFails / lastError / lastErrorAt).
 * Re-enable manually (Prisma Studio) after fixing the feed URL / selectors.
 */

export async function recordFetchSuccess(source: Source): Promise<void> {
  await prisma.source.update({
    where: { id: source.id },
    data: {
      lastFetch: new Date(),
      consecutiveFails: 0,
      lastError: null,
      lastErrorAt: null,
    },
  });
}

/** Record a usable but incomplete payload without incrementing hard failures. */
export async function recordFetchDegraded(source: Source, reason: string): Promise<void> {
  await prisma.source.update({
    where: { id: source.id },
    data: {
      lastFetch: new Date(),
      consecutiveFails: 0,
      lastError: reason.slice(0, 500),
      lastErrorAt: new Date(),
    },
  });
}

export async function recordFetchFailure(
  source: Source,
  err: unknown,
): Promise<{ fails: number; disabled: boolean; persisted: boolean }> {
  const message = err instanceof Error ? err.message : String(err);
  let fails = source.consecutiveFails + 1;
  let disabled = false;
  let persisted = false;
  try {
    // Increment in SQL instead of using the stale Source object captured at
    // cycle start. This preserves consecutive failures if another worker (or
    // a retry) records a failure before this update reaches PostgreSQL.
    const updated = await prisma.source.update({
      where: { id: source.id },
      data: {
        consecutiveFails: { increment: 1 },
        lastError: message.slice(0, 500),
        lastErrorAt: new Date(),
      },
      select: { consecutiveFails: true },
    });
    fails = updated.consecutiveFails;
    persisted = true;
    if (fails >= config.sourceFailThreshold) {
      const disabledUpdate = await prisma.source.updateMany({
        where: { id: source.id, consecutiveFails: { gte: config.sourceFailThreshold } },
        data: { enabled: false },
      });
      // Only claim auto-disable when PostgreSQL confirms the conditional write.
      // A concurrent success or a failed second write must not produce a false
      // green operational report.
      disabled = disabledUpdate.count === 1;
      // A thresholded failure is only fully persisted when both the counter
      // and the conditional disable write are confirmed. This lets the cycle
      // surface a transient second-write/race instead of silently claiming
      // the source is no longer scheduled.
      persisted = disabled;
    }
  } catch (e) {
    disabled = false;
    persisted = false;
    console.warn(`    health update failed for ${source.slug}:`, e instanceof Error ? e.message : String(e));
  }
  return { fails, disabled, persisted };
}
