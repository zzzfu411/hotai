import { describe, expect, it } from "vitest";
import { collectHealthSnapshot } from "./health";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("health snapshot (PostgreSQL)", () => {
  it("collects the migrated coordination, quota, source, and AI aggregates", async () => {
    const snapshot = await collectHealthSnapshot(new Date("2026-08-31T12:00:00.000Z"));
    expect(snapshot.database.ok).toBe(true);
    expect(snapshot.checkedAt).toBe("2026-08-31T12:00:00.000Z");
    expect(snapshot.sources.total).toBeGreaterThanOrEqual(0);
    expect(snapshot.ai.articles).toHaveProperty("processing");
    expect(snapshot.ask.expiredReservations).toBeGreaterThanOrEqual(0);
    expect(snapshot.rateLimit.activeBuckets).toBeGreaterThanOrEqual(0);
  });
});
