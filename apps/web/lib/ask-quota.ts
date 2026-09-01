import { prisma } from "./db";
import type { Prisma } from "@hotai/db";
import { ASK_DAILY_TOKEN_LIMIT } from "./ask-guard";

function bounded(env: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(env);
  const value = Number.isFinite(n) && env !== undefined && env !== "" ? n : fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export const ASK_MAX_CONCURRENT = bounded(process.env.ASK_MAX_CONCURRENT, 8, 1, 100);
export const ASK_RESERVATION_TTL_MS =
  bounded(process.env.ASK_RESERVATION_TTL_SECONDS, 600, 60, 3_600) * 1000;

export type AskQuotaReservation = {
  id: string;
  reservedTokens: number;
};

export type AskQuotaResult =
  | { ok: true; reservation: AskQuotaReservation }
  | { ok: false; reason: "quota" | "concurrency" | "unavailable" };

async function lockAskQuota(tx: Prisma.TransactionClient): Promise<void> {
  // Select a scalar instead of PostgreSQL's void result so Prisma can
  // deserialize the query while still executing the volatile lock function.
  await tx.$queryRaw<Array<{ locked: number }>>`
    SELECT 1::int AS locked
    FROM pg_advisory_xact_lock(${20_260_831}::int, ${1}::int)
  `;
}

export function startOfUtcQuotaDay(now = new Date()): Date {
  const day = new Date(now);
  day.setUTCHours(0, 0, 0, 0);
  return day;
}

/**
 * Reserve tokens and one global concurrency slot in PostgreSQL. A fixed,
 * transaction-scoped advisory lock serializes every web process before the
 * shared usage and reservation rows are read or written.
 */
export async function reserveAskQuota(tokens: number): Promise<AskQuotaResult> {
  const reservedTokens = Math.max(0, Math.round(tokens));
  const now = new Date();
  const day = startOfUtcQuotaDay(now);
  const expiresAt = new Date(now.getTime() + ASK_RESERVATION_TTL_MS);

  try {
    return await prisma.$transaction(async (tx) => {
      // PostgreSQL transaction-scoped advisory lock: every web process queues
      // on the same cost-valve critical section.
      await lockAskQuota(tx);
      // An explicit updatedAt write keeps the daily row visibly fresh even
      // when no settled usage has changed yet.
      await tx.askDailyUsage.upsert({
        where: { day },
        create: { day, usedTokens: 0 },
        update: { updatedAt: now },
      });

      // A crashed worker cannot retain a slot forever. Charge its full
      // reservation conservatively before releasing it, so crashes cannot be
      // used to evade the daily spend cap.
      const expired = await tx.askReservation.groupBy({
        by: ["day"],
        where: { expiresAt: { lte: now } },
        _sum: { reservedTokens: true },
      });
      for (const row of expired) {
        const expiredTokens = row._sum.reservedTokens ?? 0;
        if (expiredTokens <= 0) continue;
        await tx.askDailyUsage.update({
          where: { day: row.day },
          data: { usedTokens: { increment: expiredTokens } },
        });
      }
      await tx.askReservation.deleteMany({ where: { expiresAt: { lte: now } } });

      // Concurrency is global rather than per UTC quota day. Without this,
      // calls started just before midnight and calls started just after it can
      // occupy twice the configured number of provider slots.
      const activeCount = await tx.askReservation.count({
        where: { expiresAt: { gt: now } },
      });
      if (activeCount >= ASK_MAX_CONCURRENT) {
        return { ok: false as const, reason: "concurrency" as const };
      }

      const [usage, inFlight] = await Promise.all([
        tx.askDailyUsage.findUniqueOrThrow({ where: { day } }),
        tx.askReservation.aggregate({
          where: { day, expiresAt: { gt: now } },
          _sum: { reservedTokens: true },
        }),
      ]);
      const inFlightTokens = inFlight._sum.reservedTokens ?? 0;
      if (
        ASK_DAILY_TOKEN_LIMIT > 0 &&
        usage.usedTokens + inFlightTokens + reservedTokens > ASK_DAILY_TOKEN_LIMIT
      ) {
        return { ok: false as const, reason: "quota" as const };
      }

      const reservation = await tx.askReservation.create({
        data: { day, reservedTokens, expiresAt },
        select: { id: true, reservedTokens: true },
      });
      return { ok: true as const, reservation };
    });
  } catch (err) {
    console.error("[ask] quota reservation unavailable:", safeError(err));
    return { ok: false, reason: "unavailable" };
  }
}

/** Replace one in-flight reservation with measured/estimated actual usage. */
export async function settleAskQuota(
  reservation: AskQuotaReservation,
  actualTokens: number,
): Promise<void> {
  const actual = Math.max(0, Math.round(actualTokens));
  try {
    await prisma.$transaction(async (tx) => {
      // Serialize settlement with expiry sweeps so the same reservation cannot
      // be conservatively charged and then also settled at actual usage.
      await lockAskQuota(tx);
      const row = await tx.askReservation.findUnique({
        where: { id: reservation.id },
        select: { id: true, day: true },
      });
      // An expiry sweep already charged the conservative reservation. Do not
      // double-charge a late completion.
      if (!row) return;
      await tx.askDailyUsage.update({
        where: { day: row.day },
        data: { usedTokens: { increment: actual } },
      });
      await tx.askReservation.delete({ where: { id: row.id } });
    });
  } catch (err) {
    // Fail soft after the provider call: the reservation remains and will be
    // charged in full by the next expiry sweep.
    console.error("[ask] quota settlement deferred:", safeError(err));
  }
}

function safeError(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 300) : "unknown database error";
}
