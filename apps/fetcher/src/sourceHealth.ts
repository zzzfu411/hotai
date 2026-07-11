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
    },
  });
}

export async function recordFetchFailure(
  source: Source,
  err: Error,
): Promise<{ fails: number; disabled: boolean }> {
  const fails = source.consecutiveFails + 1;
  const disabled = fails >= config.sourceFailThreshold;
  await prisma.source
    .update({
      where: { id: source.id },
      data: {
        consecutiveFails: fails,
        lastError: err.message.slice(0, 500),
        lastErrorAt: new Date(),
        ...(disabled ? { enabled: false } : {}),
      },
    })
    .catch((e) =>
      console.warn(`    health update failed for ${source.slug}:`, (e as Error).message),
    );
  return { fails, disabled };
}
