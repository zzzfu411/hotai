import type { Source } from "@hotai/db";
import { prisma } from "@hotai/db";
import { config } from "./config.js";

/**
 * Per-source fetch health. Failures used to vanish into PM2 logs while a dead
 * feed kept burning cycles for weeks — now a source that fails
 * SOURCE_FAIL_THRESHOLD consecutive cycles is automatically paused and the state is
 * queryable on the Source row (consecutiveFails / lastError / lastErrorAt).
 * Retry after SOURCE_RETRY_MINUTES. enabled=false always means manual stop.
 */

export async function recordFetchSuccess(source: Source): Promise<void> {
  await prisma.source.update({
    where: { id: source.id },
    data: {
      lastFetch: new Date(),
      consecutiveFails: 0,
      lastError: null,
      lastErrorAt: null,
      autoPausedUntil: null,
    },
  });
}

export function getDueSources(now = new Date()) {
  return prisma.source.findMany({ where: {
    enabled: true,
    OR: [{ autoPausedUntil: null }, { autoPausedUntil: { lte: now } }],
  } });
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
      autoPausedUntil: null,
    },
  });
}

export async function recordFetchFailure(
  source: Source,
  err: unknown,
): Promise<{ fails: number; autoPaused: boolean; persisted: boolean }> {
  const message = err instanceof Error ? err.message : String(err);
  let fails = source.consecutiveFails + 1;
  let autoPaused = false;
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
        where: { id: source.id, enabled: true, consecutiveFails: { gte: config.sourceFailThreshold } },
        data: { autoPausedUntil: new Date(Date.now() + config.sourceRetryMs) },
      });
      // Only claim auto-pause when PostgreSQL confirms the conditional write.
      // A concurrent success or a failed second write must not produce a false
      // green operational report.
      autoPaused = disabledUpdate.count === 1;
      // A thresholded failure is only fully persisted when both the counter
      // and the conditional pause write are confirmed. This lets the cycle
      // surface a transient second-write/race instead of silently claiming
      // the source is no longer scheduled.
      persisted = autoPaused;
    }
  } catch (e) {
    autoPaused = false;
    persisted = false;
    console.warn(`    health update failed for ${source.slug}:`, e instanceof Error ? e.message : String(e));
  }
  return { fails, autoPaused, persisted };
}
