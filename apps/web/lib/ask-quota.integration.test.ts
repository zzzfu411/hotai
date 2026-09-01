import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "./db";
import { reserveAskQuota, settleAskQuota, startOfUtcQuotaDay } from "./ask-quota";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
const day = startOfUtcQuotaDay();
const previousDay = new Date(day);
previousDay.setUTCDate(previousDay.getUTCDate() - 1);

describeDb("ask quota (PostgreSQL)", () => {
  beforeEach(async () => {
    await prisma.askReservation.deleteMany({ where: { day: { in: [day, previousDay] } } });
    await prisma.askDailyUsage.deleteMany({ where: { day: { in: [day, previousDay] } } });
  });

  afterAll(async () => {
    await prisma.askReservation.deleteMany({ where: { day: { in: [day, previousDay] } } });
    await prisma.askDailyUsage.deleteMany({ where: { day: { in: [day, previousDay] } } });
  });

  it("atomically caps global concurrency and settles actual usage", async () => {
    const attempts = await Promise.all(Array.from({ length: 10 }, () => reserveAskQuota(100)));
    const accepted = attempts.filter((x) => x.ok);
    const rejected = attempts.filter((x) => !x.ok);
    expect(accepted).toHaveLength(8);
    expect(rejected.every((x) => !x.ok && x.reason === "concurrency")).toBe(true);

    await Promise.all(
      accepted.map((x) => x.ok && settleAskQuota(x.reservation, 50)),
    );
    const usage = await prisma.askDailyUsage.findUniqueOrThrow({ where: { day } });
    expect(usage.usedTokens).toBe(400);
    expect(await prisma.askReservation.count({ where: { day } })).toBe(0);
  });

  it("charges prior-day crashes and keeps concurrency global across UTC midnight", async () => {
    await prisma.askDailyUsage.create({ data: { day: previousDay, usedTokens: 0 } });
    await prisma.askReservation.create({
      data: {
        day: previousDay,
        reservedTokens: 75,
        expiresAt: new Date(Date.now() - 1_000),
      },
    });

    const accepted = await reserveAskQuota(10);
    expect(accepted.ok).toBe(true);
    expect(
      (await prisma.askDailyUsage.findUniqueOrThrow({ where: { day: previousDay } })).usedTokens,
    ).toBe(75);
    expect(
      await prisma.askReservation.count({
        where: { day: previousDay, expiresAt: { lte: new Date() } },
      }),
    ).toBe(0);
    if (accepted.ok) await settleAskQuota(accepted.reservation, 5);

    await prisma.askReservation.createMany({
      data: Array.from({ length: 8 }, (_, i) => ({
        id: `previous-day-active-${Date.now()}-${i}`,
        day: previousDay,
        reservedTokens: 10,
        expiresAt: new Date(Date.now() + 5 * 60_000),
      })),
    });
    const blocked = await reserveAskQuota(10);
    expect(blocked).toEqual({ ok: false, reason: "concurrency" });
  });
});
