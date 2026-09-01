import {
  acquireCoordinationLease,
  finishCoordinationLease,
  renewCoordinationLease,
  type CoordinationLeaseClaim,
} from "@hotai/db";
import { config } from "./config.js";

export const FETCHER_CYCLE_LEASE_NAME = "fetcher-cycle";

export type SingletonJobResult<T> =
  | { acquired: true; value: T; leaseHealthy: boolean }
  | { acquired: false; leaseUntil: Date };

/**
 * Run one job under a durable, cross-process PostgreSQL lease. Heartbeats keep
 * long fetch cycles owned; a crash stops heartbeats and the expiry makes the
 * next scheduled process eligible to recover the job.
 */
export async function runWithFetcherCycleLease<T>(
  work: () => Promise<T>,
  options: { name?: string; ttlMs?: number; heartbeatMs?: number } = {},
): Promise<SingletonJobResult<T>> {
  const name = options.name ?? FETCHER_CYCLE_LEASE_NAME;
  const ttlMs = options.ttlMs ?? config.cycleLeaseMs;
  const heartbeatMs = Math.max(
    5_000,
    Math.min(options.heartbeatMs ?? Math.floor(ttlMs / 3), 60_000),
  );
  const lease = await acquireCoordinationLease(name, ttlMs);
  if (!lease.acquired) return { acquired: false, leaseUntil: lease.leaseUntil };

  let leaseHealthy = true;
  let renewal: Promise<void> | null = null;
  const timer = setInterval(() => {
    if (renewal) return;
    const current = renewCoordinationLease(lease, ttlMs)
      .then((renewed) => {
        if (!renewed) {
          leaseHealthy = false;
          console.error(`[fetcher] lost coordination lease ${JSON.stringify(name)}`);
        }
      })
      .catch((error) => {
        leaseHealthy = false;
        console.error("[fetcher] coordination lease heartbeat failed:", safeError(error));
      })
      .finally(() => {
        if (renewal === current) renewal = null;
      });
    renewal = current;
  }, heartbeatMs);
  timer.unref?.();

  try {
    const value = await work();
    clearInterval(timer);
    if (renewal) await renewal;
    const settled = await finishQuietly(lease, "success");
    return { acquired: true, value, leaseHealthy: leaseHealthy && settled };
  } catch (error) {
    clearInterval(timer);
    if (renewal) await renewal;
    await finishQuietly(lease, "failed", error);
    throw error;
  } finally {
    clearInterval(timer);
  }
}

async function finishQuietly(
  lease: Extract<CoordinationLeaseClaim, { acquired: true }>,
  status: "success" | "failed",
  error?: unknown,
): Promise<boolean> {
  try {
    const settled = await finishCoordinationLease(lease, status, error);
    if (!settled) console.error(`[fetcher] coordination lease ownership changed before ${status}`);
    return settled;
  } catch (leaseError) {
    console.error("[fetcher] coordination lease settlement failed:", safeError(leaseError));
    return false;
  }
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 300) : "unknown database error";
}
