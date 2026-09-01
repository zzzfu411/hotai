import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./client.js";

const COORDINATION_LOCK_NAMESPACE = 20_260_831;
const COORDINATION_LOCK_KEY = 2;
const MIN_LEASE_MS = 30_000;
const MAX_LEASE_MS = 24 * 60 * 60 * 1000;

export type CoordinationLeaseClaim =
  | { acquired: true; name: string; ownerId: string; leaseUntil: Date }
  | { acquired: false; name: string; leaseUntil: Date; ownerId: string };

export type CoordinationLeaseStatus = "success" | "degraded" | "failed";

function normalizedLeaseMs(ttlMs: number): number {
  if (!Number.isFinite(ttlMs)) return MIN_LEASE_MS;
  return Math.min(MAX_LEASE_MS, Math.max(MIN_LEASE_MS, Math.trunc(ttlMs)));
}

function normalizedName(name: string): string {
  const value = name.trim();
  if (!value || value.length > 160) {
    throw new Error("coordination lease name must contain 1-160 characters");
  }
  return value;
}

async function lockCoordination(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$queryRaw<Array<{ locked: number }>>`
    SELECT 1::int AS locked
    FROM pg_advisory_xact_lock(
      ${COORDINATION_LOCK_NAMESPACE}::int,
      ${COORDINATION_LOCK_KEY}::int
    )
  `;
}

/**
 * Claim a singleton job lease across every process sharing PostgreSQL.
 *
 * The advisory lock covers only the short read/update critical section. The
 * durable lease covers the actual network-heavy job, avoiding a long-lived
 * idle transaction while still allowing automatic crash recovery.
 */
export async function acquireCoordinationLease(
  name: string,
  ttlMs: number,
  options: { ownerId?: string; now?: Date } = {},
): Promise<CoordinationLeaseClaim> {
  const leaseName = normalizedName(name);
  const ownerId = options.ownerId ?? randomUUID();
  const now = options.now ?? new Date();
  const leaseUntil = new Date(now.getTime() + normalizedLeaseMs(ttlMs));

  return prisma.$transaction(async (tx) => {
    await lockCoordination(tx);
    const current = await tx.coordinationLease.findUnique({ where: { name: leaseName } });
    if (
      current &&
      current.lastStatus === "running" &&
      current.leaseUntil.getTime() > now.getTime() &&
      current.ownerId !== ownerId
    ) {
      return {
        acquired: false as const,
        name: leaseName,
        leaseUntil: current.leaseUntil,
        ownerId: current.ownerId,
      };
    }

    await tx.coordinationLease.upsert({
      where: { name: leaseName },
      create: {
        name: leaseName,
        ownerId,
        leaseUntil,
        heartbeatAt: now,
        startedAt: now,
        attempts: 1,
        lastStatus: "running",
      },
      update: {
        ownerId,
        leaseUntil,
        heartbeatAt: now,
        startedAt: now,
        attempts: { increment: 1 },
        lastStatus: "running",
        lastError: null,
      },
    });
    return { acquired: true as const, name: leaseName, ownerId, leaseUntil };
  });
}

/** Extend a live lease. A stale owner can never renew a replacement owner's job. */
export async function renewCoordinationLease(
  lease: Pick<Extract<CoordinationLeaseClaim, { acquired: true }>, "name" | "ownerId">,
  ttlMs: number,
  now = new Date(),
): Promise<boolean> {
  const leaseUntil = new Date(now.getTime() + normalizedLeaseMs(ttlMs));
  const result = await prisma.coordinationLease.updateMany({
    where: {
      name: lease.name,
      ownerId: lease.ownerId,
      lastStatus: "running",
      // A worker that was paused longer than its TTL must not resurrect an
      // expired lease (and potentially block the replacement owner).
      leaseUntil: { gt: now },
    },
    data: { leaseUntil, heartbeatAt: now },
  });
  return result.count === 1;
}

/**
 * Mark a lease complete and release it immediately. Conditional ownership
 * prevents a late worker from overwriting a successor after its lease expired.
 */
export async function finishCoordinationLease(
  lease: Pick<Extract<CoordinationLeaseClaim, { acquired: true }>, "name" | "ownerId">,
  status: CoordinationLeaseStatus,
  error?: unknown,
  now = new Date(),
): Promise<boolean> {
  const result = await prisma.coordinationLease.updateMany({
    where: { name: lease.name, ownerId: lease.ownerId, lastStatus: "running" },
    data: {
      leaseUntil: now,
      heartbeatAt: now,
      lastFinishedAt: now,
      lastStatus: status,
      lastError: status === "success" ? null : safeError(error),
    },
  });
  return result.count === 1;
}

function safeError(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 500);
  if (typeof error === "string") return error.slice(0, 500);
  return "unknown job failure";
}
