import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  acquireCoordinationLease,
  finishCoordinationLease,
  prisma,
  renewCoordinationLease,
} from "./index.js";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
const names = ["test:coordination:race", "test:coordination:recovery"];

describeDb("coordination leases (PostgreSQL)", () => {
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
});
