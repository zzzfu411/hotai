import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@hotai/db";
import { runWithFetcherCycleLease } from "./cycle-lock.js";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
const name = "test:fetcher-cycle-lock";

describeDb("fetcher cycle lease (PostgreSQL)", () => {
  afterAll(async () => {
    await prisma.coordinationLease.deleteMany({ where: { name } });
  });

  it("allows only one overlapping cycle", async () => {
    await prisma.coordinationLease.deleteMany({ where: { name } });
    let release!: () => void;
    let started!: () => void;
    const startSignal = new Promise<void>((resolve) => {
      started = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const first = runWithFetcherCycleLease(
      async () => {
        started();
        await gate;
        return "first";
      },
      { name, ttlMs: 60_000, heartbeatMs: 5_000 },
    );
    await startSignal;

    const second = await runWithFetcherCycleLease(async () => "second", {
      name,
      ttlMs: 60_000,
      heartbeatMs: 5_000,
    });
    expect(second.acquired).toBe(false);

    release();
    const completed = await first;
    expect(completed).toEqual({ acquired: true, value: "first", leaseHealthy: true });
  });
});
