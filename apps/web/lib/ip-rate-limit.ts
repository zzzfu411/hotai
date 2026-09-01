import { createHash } from "node:crypto";
import type { Prisma } from "@hotai/db";
import { prisma } from "./db";

const RATE_LIMIT_LOCK_NAMESPACE = 20_260_830;

function configuredMaxKeys(): number {
  const raw = Number(process.env.PUBLIC_RATE_LIMIT_MAX_KEYS);
  return Number.isFinite(raw) && raw > 0
    ? Math.min(1_000_000, Math.max(1, Math.trunc(raw)))
    : 20_000;
}

export type RateLimitResult =
  | { ok: true; remaining: number; resetAt: Date }
  | { ok: false; reason: "limited" | "unavailable"; retryAfterSec: number };

export type RateLimitOptions = {
  limit: number;
  windowMs?: number;
  maxKeys?: number;
  /** Deterministic integration-test hook; production callers omit it. */
  now?: Date;
};

/** Persist only a namespaced digest, never the raw client address. */
export function hashRateLimitKey(name: string, clientKey: string): string {
  return createHash("sha256").update(name).update("\0").update(clientKey).digest("hex");
}

function advisoryKey(name: string): number {
  return createHash("sha256").update(name).digest().readInt32BE(0);
}

async function lockLimiter(tx: Prisma.TransactionClient, name: string): Promise<void> {
  await tx.$queryRaw<Array<{ locked: number }>>`
    SELECT 1::int AS locked
    FROM pg_advisory_xact_lock(${RATE_LIMIT_LOCK_NAMESPACE}::int, ${advisoryKey(name)}::int)
  `;
}

/**
 * Cross-process fixed-window limiter backed by PostgreSQL. One short advisory
 * lock per limiter namespace makes increments and the active-key capacity
 * check exact across every web process. Database failure is fail-closed.
 */
export async function limitIp(
  name: string,
  ip: string,
  opts: RateLimitOptions,
): Promise<RateLimitResult> {
  const limiterName = name.trim();
  if (!limiterName || limiterName.length > 80) {
    throw new Error("rate-limit name must contain 1-80 characters");
  }
  const limit = Math.min(100_000, Math.max(1, Math.trunc(opts.limit)));
  const requestedWindow = opts.windowMs ?? 60_000;
  const windowMs = Math.min(24 * 60 * 60 * 1000, Math.max(1_000, Math.trunc(requestedWindow)));
  const maxKeys = Math.min(
    1_000_000,
    Math.max(1, Math.trunc(opts.maxKeys ?? configuredMaxKeys())),
  );
  const now = opts.now ?? new Date();
  const nextReset = new Date(now.getTime() + windowMs);
  const keyHash = hashRateLimitKey(limiterName, ip);

  try {
    const row = await prisma.$transaction(async (tx) => {
      await lockLimiter(tx, limiterName);
      // Opportunistic cleanup bounds the table even if the fetcher is down.
      await tx.rateLimitBucket.deleteMany({
        where: { name: limiterName, resetAt: { lte: now } },
      });
      const existing = await tx.rateLimitBucket.findUnique({
        where: { name_keyHash: { name: limiterName, keyHash } },
      });
      if (existing) {
        return tx.rateLimitBucket.update({
          where: { name_keyHash: { name: limiterName, keyHash } },
          data: { count: Math.min(limit + 1, existing.count + 1) },
        });
      }

      const activeKeys = await tx.rateLimitBucket.count({ where: { name: limiterName } });
      if (activeKeys >= maxKeys) {
        const earliest = await tx.rateLimitBucket.findFirst({
          where: { name: limiterName },
          orderBy: { resetAt: "asc" },
          select: { resetAt: true },
        });
        return { count: limit + 1, resetAt: earliest?.resetAt ?? nextReset };
      }
      return tx.rateLimitBucket.create({
        data: { name: limiterName, keyHash, count: 1, resetAt: nextReset },
      });
    });

    if (row.count <= limit) {
      return { ok: true, remaining: Math.max(0, limit - row.count), resetAt: row.resetAt };
    }
    return {
      ok: false,
      reason: "limited",
      retryAfterSec: Math.max(1, Math.ceil((row.resetAt.getTime() - now.getTime()) / 1000)),
    };
  } catch (error) {
    console.error("[rate-limit] shared limiter unavailable:", safeError(error));
    return { ok: false, reason: "unavailable", retryAfterSec: 5 };
  }
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 300) : "unknown database error";
}
