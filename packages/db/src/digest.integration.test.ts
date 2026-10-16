import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  acquireCoordinationLease,
  finishCoordinationLease,
  prisma,
  runDigestGeneration,
  startOfUtcDay,
  type DigestContent,
  type Prisma,
  type DigestCorpusArticle,
} from "./index.js";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
const slug = `test-digest-${process.pid}`;
// Far outside any real data so the corpus is only what this test writes.
const day = startOfUtcDay(new Date("2001-02-03T12:00:00Z"));
const emptyDay = startOfUtcDay(new Date("2001-02-04T12:00:00Z"));
const leaseName = "digest:2001-02-03";

const content: DigestContent = {
  headline: "Five stories",
  overview: "A test brief.",
  bullets: [{ title: "One", takeaway: "Two", urls: [] }],
  themes: ["test"],
  model: "test-model",
};

describeDb("digest generation (PostgreSQL)", () => {
  beforeAll(async () => {
    await prisma.source.deleteMany({ where: { slug } });
    const source = await prisma.source.create({
      data: { slug, name: "Digest Source", url: "https://digest.example/feed", type: "rss", lang: "en", category: "research" },
    });
    await prisma.article.createMany({
      data: Array.from({ length: 6 }, (_, i) => ({
        sourceId: source.id,
        url: `https://digest.example/${process.pid}/${i}`,
        urlHash: `digest-url-${process.pid}-${i}`,
        title: `Story ${i}`,
        titleHash: `digest-title-${process.pid}-${i}`,
        summary: `Summary ${i}`,
        publishedAt: new Date(day.getTime() + (i + 1) * 3600 * 1000),
        lang: "en",
        category: "research",
        score: i,
      })),
    });
  });

  beforeEach(async () => {
    await prisma.digest.deleteMany({ where: { date: { in: [day, emptyDay] } } });
    await prisma.coordinationLease.deleteMany({ where: { name: { in: [leaseName, "digest:2001-02-04"] } } });
  });

  afterAll(async () => {
    await prisma.digest.deleteMany({ where: { date: { in: [day, emptyDay] } } });
    await prisma.coordinationLease.deleteMany({ where: { name: { in: [leaseName, "digest:2001-02-04"] } } });
    await prisma.source.deleteMany({ where: { slug } });
  });

  it("skips a day with too few stories without claiming the lease", async () => {
    const run = await runDigestGeneration({ day: emptyDay, leaseMs: 60_000, keep: () => true, generate: async () => content });
    expect(run).toEqual({ status: "skipped", articles: 0 });
    expect(await prisma.coordinationLease.findUnique({ where: { name: "digest:2001-02-04" } })).toBeNull();
  });

  it("writes the brief from the day's stories, highest score first", async () => {
    let seen: DigestCorpusArticle[] = [];
    const run = await runDigestGeneration({
      day,
      leaseMs: 60_000,
      keep: () => true,
      generate: async (corpus) => {
        seen = corpus;
        return content;
      },
    });
    expect(run.status).toBe("saved");
    expect(seen.map((a) => a.title)).toEqual(["Story 5", "Story 4", "Story 3", "Story 2", "Story 1", "Story 0"]);
    expect(seen[0]).toMatchObject({ summaryEn: "Summary 5", sourceName: "Digest Source" });
    const row = await prisma.digest.findUnique({ where: { date: day } });
    expect(row?.headline).toBe("Five stories");
    const lease = await prisma.coordinationLease.findUnique({ where: { name: leaseName } });
    expect(lease?.lastStatus).toBe("success");
  });

  it("keeps an existing row without calling the model", async () => {
    await prisma.digest.create({
      data: { date: day, ...content, bullets: content.bullets as Prisma.InputJsonValue, headline: "Already here" },
    });
    let called = false;
    const run = await runDigestGeneration({
      day,
      leaseMs: 60_000,
      keep: () => true,
      generate: async () => {
        called = true;
        return content;
      },
    });
    expect(run.status).toBe("current");
    expect(called).toBe(false);
  });

  it("stands back while another process holds the lease", async () => {
    const other = await acquireCoordinationLease(leaseName, 60_000, { ownerId: "other-process" });
    expect(other.acquired).toBe(true);
    let called = false;
    const run = await runDigestGeneration({
      day,
      leaseMs: 60_000,
      keep: () => false,
      generate: async () => {
        called = true;
        return content;
      },
    });
    expect(run.status).toBe("busy");
    expect(called).toBe(false);
    if (other.acquired) await finishCoordinationLease(other, "success");
  });

  it("releases the lease as failed when the model returns nothing", async () => {
    const run = await runDigestGeneration({ day, leaseMs: 60_000, keep: () => false, generate: async () => null });
    expect(run.status).toBe("failed");
    expect(await prisma.digest.findUnique({ where: { date: day } })).toBeNull();
    const lease = await prisma.coordinationLease.findUnique({ where: { name: leaseName } });
    expect(lease?.lastStatus).toBe("failed");
  });
});
