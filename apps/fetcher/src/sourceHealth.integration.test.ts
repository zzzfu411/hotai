import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@hotai/db";
import { config } from "./config.js";
import { getDueSources, recordFetchFailure, recordFetchSuccess } from "./sourceHealth.js";
const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
describeDb("automatic source recovery (PostgreSQL)", () => {
  const slug = "test:source-recovery";
  afterAll(async () => { await prisma.source.deleteMany({ where: { slug } }); });
  it("retries a paused source after its deadline and never restarts a manual stop", async () => {
    await prisma.source.deleteMany({ where: { slug } });
    const source = await prisma.source.create({ data: { slug, name: "Recovery test", url: "https://example.com/feed", type: "rss", lang: "en", category: "research" } });
    for (let i = 0; i < config.sourceFailThreshold; i++) await recordFetchFailure(source, new Error("upstream unavailable"));
    const paused = await prisma.source.findUniqueOrThrow({ where: { id: source.id } });
    expect(paused.enabled).toBe(true);
    expect((await getDueSources()).some(s => s.id === source.id)).toBe(false);
    expect((await getDueSources(new Date(paused.autoPausedUntil!.getTime() + 1))).some(s => s.id === source.id)).toBe(true);
    await recordFetchSuccess(source);
    expect((await getDueSources()).some(s => s.id === source.id)).toBe(true);
    await prisma.source.update({ where: { id: source.id }, data: { enabled: false } });
    await recordFetchSuccess(source);
    expect((await getDueSources(new Date(Date.now() + 86400_000))).some(s => s.id === source.id)).toBe(false);
  });
});
