import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "./db";
import { hashRateLimitKey, limitIp } from "./ip-rate-limit";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
const names = [
  "test-rate-window",
  "test-rate-isolation",
  "test-rate-hash",
  "test-rate-capacity",
  "test-rate-concurrency",
];

describe("hashRateLimitKey", () => {
  it("is deterministic, namespaced, and does not embed the raw address", () => {
    const a = hashRateLimitKey("feed", "203.0.113.9");
    expect(a).toHaveLength(64);
    expect(a).not.toContain("203.0.113.9");
    expect(a).toBe(hashRateLimitKey("feed", "203.0.113.9"));
    expect(a).not.toBe(hashRateLimitKey("reader", "203.0.113.9"));
  });
});

describeDb("limitIp (PostgreSQL)", () => {
  beforeEach(async () => {
    await prisma.rateLimitBucket.deleteMany({ where: { name: { in: names } } });
  });

  afterAll(async () => {
    await prisma.rateLimitBucket.deleteMany({ where: { name: { in: names } } });
  });

  it("atomically allows the configured count and resets the fixed window", async () => {
    const now = new Date("2026-08-31T12:00:00.000Z");
    expect((await limitIp(names[0]!, "203.0.113.9", { limit: 2, now })).ok).toBe(true);
    expect((await limitIp(names[0]!, "203.0.113.9", { limit: 2, now })).ok).toBe(true);
    const blocked = await limitIp(names[0]!, "203.0.113.9", { limit: 2, now });
    expect(blocked).toEqual({ ok: false, reason: "limited", retryAfterSec: 60 });

    const reset = await limitIp(names[0]!, "203.0.113.9", {
      limit: 2,
      now: new Date(now.getTime() + 60_001),
    });
    expect(reset.ok).toBe(true);
  });

  it("isolates buckets across limiter names and client addresses", async () => {
    const now = new Date("2026-08-31T12:00:00.000Z");
    expect((await limitIp(names[1]!, "203.0.113.1", { limit: 1, now })).ok).toBe(true);
    expect((await limitIp(names[1]!, "203.0.113.1", { limit: 1, now })).ok).toBe(false);
    expect((await limitIp(names[1]!, "203.0.113.2", { limit: 1, now })).ok).toBe(true);
    expect((await limitIp(names[2]!, "203.0.113.1", { limit: 1, now })).ok).toBe(true);
  });

  it("stores only the hashed client key", async () => {
    const ip = "203.0.113.77";
    await limitIp(names[2]!, ip, { limit: 1 });
    const row = await prisma.rateLimitBucket.findUniqueOrThrow({
      where: { name_keyHash: { name: names[2]!, keyHash: hashRateLimitKey(names[2]!, ip) } },
    });
    expect(row.keyHash).toHaveLength(64);
    expect(JSON.stringify(row)).not.toContain(ip);
  });

  it("bounds active keys without evicting a live bucket", async () => {
    const now = new Date("2026-08-31T12:00:00.000Z");
    expect((await limitIp(names[3]!, "203.0.113.1", { limit: 2, maxKeys: 2, now })).ok).toBe(true);
    expect((await limitIp(names[3]!, "203.0.113.2", { limit: 2, maxKeys: 2, now })).ok).toBe(true);
    const full = await limitIp(names[3]!, "203.0.113.3", { limit: 2, maxKeys: 2, now });
    expect(full).toEqual({ ok: false, reason: "limited", retryAfterSec: 60 });
    expect(await prisma.rateLimitBucket.count({ where: { name: names[3]! } })).toBe(2);
  });

  it("serializes concurrent increments", async () => {
    const now = new Date("2026-08-31T12:00:00.000Z");
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        limitIp(names[4]!, "203.0.113.99", { limit: 2, now }),
      ),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(2);
    expect(results.filter((result) => !result.ok)).toHaveLength(8);
  });
});
