import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  acquireCoordinationLease,
  finishCoordinationLease,
  prisma,
  renewCoordinationLease,
  withCoordinationLease,
} from "./index.js";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
const names = [
  "test:coordination:race",
  "test:coordination:recovery",
  "test:coordination:degraded",
  "test:coordination:expired-renew",
  "test:coordination:fenced-write",
];

describeDb("coordination leases (PostgreSQL)", () => {
  it("prevents an expired owner from committing after takeover", async () => {
    const first = await acquireCoordinationLease(names[4]!, 30_000, { ownerId: "old", now: new Date(Date.now() - 60_000) });
    const replacement = await acquireCoordinationLease(names[4]!, 30_000, { ownerId: "new" });
    expect(first.acquired && replacement.acquired).toBe(true);
    let called = false;
    await expect(withCoordinationLease(first, async () => { called = true; })).rejects.toThrow("lost before commit");
    expect(called).toBe(false);
    expect(await withCoordinationLease(replacement, async () => "saved")).toBe("saved");
  });
  beforeEach(async () => {
    await prisma.coordinationLease.deleteMany({ where: { name: { in: names } } });
  });

  afterAll(async () => {
    await prisma.coordinationLease.deleteMany({ where: { name: { in: names } } });
  });

  it("serializes concurrent claims across owners", async () => {
    const now = new Date("2026-08-31T12:00:00.000Z");
    const claims = await Promise.all([
      acquireCoordinationLease(names[0]!, 60_000, { ownerId: "worker-a", now }),
      acquireCoordinationLease(names[0]!, 60_000, { ownerId: "worker-b", now }),
    ]);
    expect(claims.filter((claim) => claim.acquired)).toHaveLength(1);
    expect(claims.filter((claim) => !claim.acquired)).toHaveLength(1);

    const winner = claims.find((claim) => claim.acquired);
    expect(winner?.acquired).toBe(true);
    if (winner?.acquired) {
      expect(await renewCoordinationLease(winner, 60_000, new Date(now.getTime() + 1_000))).toBe(true);
      expect(await finishCoordinationLease(winner, "success", undefined, new Date(now.getTime() + 2_000))).toBe(true);
    }
  });

  it("recovers an expired job and rejects the stale owner's completion", async () => {
    const now = new Date("2026-08-31T12:00:00.000Z");
    const first = await acquireCoordinationLease(names[1]!, 30_000, {
      ownerId: "crashed-worker",
      now,
    });
    expect(first.acquired).toBe(true);

    const replacement = await acquireCoordinationLease(names[1]!, 30_000, {
      ownerId: "replacement-worker",
      now: new Date(now.getTime() + 30_001),
    });
    expect(replacement.acquired).toBe(true);
    if (!first.acquired || !replacement.acquired) return;

    expect(
      await finishCoordinationLease(first, "success", undefined, new Date(now.getTime() + 31_000)),
    ).toBe(false);
    expect(
      await finishCoordinationLease(
        replacement,
        "failed",
        new Error("provider timeout with private details"),
        new Date(now.getTime() + 32_000),
      ),
    ).toBe(true);

    const row = await prisma.coordinationLease.findUniqueOrThrow({ where: { name: names[1]! } });
    expect(row.ownerId).toBe("replacement-worker");
    expect(row.lastStatus).toBe("failed");
    expect(row.lastError).toContain("provider timeout");
    expect(row.attempts).toBe(2);
  });

  it("records a degraded completion without treating it as a running lease", async () => {
    const claim = await acquireCoordinationLease(names[2]!, 30_000, {
      ownerId: "degraded-worker",
      now: new Date("2026-08-31T12:00:00.000Z"),
    });
    expect(claim.acquired).toBe(true);
    if (!claim.acquired) return;
    expect(
      await finishCoordinationLease(claim, "degraded", "one source returned only stale items"),
    ).toBe(true);
    const row = await prisma.coordinationLease.findUniqueOrThrow({ where: { name: names[2]! } });
    expect(row.lastStatus).toBe("degraded");
    expect(row.lastError).toContain("stale items");
  });

  it("rejects renewal after the lease has expired", async () => {
    const now = new Date("2026-08-31T12:00:00.000Z");
    const claim = await acquireCoordinationLease(names[3]!, 30_000, {
      ownerId: "paused-worker",
      now,
    });
    expect(claim.acquired).toBe(true);
    if (!claim.acquired) return;

    expect(
      await renewCoordinationLease(claim, 30_000, new Date(now.getTime() + 30_001)),
    ).toBe(false);
    const replacement = await acquireCoordinationLease(names[3]!, 30_000, {
      ownerId: "replacement-worker",
      now: new Date(now.getTime() + 30_001),
    });
    expect(replacement.acquired).toBe(true);
  });
});
