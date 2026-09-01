import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@hotai/db";
import {
  claimEnrichmentCandidate,
  recoverExhaustedEnrichmentLeases,
  type CandidateArticle,
} from "./enrich.js";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
const slug = `audit-enrich-${process.pid}`;
let sourceId = 0;

describeDb("AI enrichment leases (PostgreSQL)", () => {
  beforeAll(async () => {
    await prisma.source.deleteMany({ where: { slug } });
    const source = await prisma.source.create({
      data: {
        slug,
        name: "Audit Source",
        url: "https://audit.example/feed.xml",
        homepage: "https://audit.example/",
        type: "rss",
        lang: "en",
        category: "research",
      },
    });
    sourceId = source.id;
  });

  afterAll(async () => {
    await prisma.source.deleteMany({ where: { slug } });
  });

  it("allows only one worker to claim the observed attempt", async () => {
    const article = await prisma.article.create({
      data: {
        sourceId,
        url: `https://audit.example/${process.pid}`,
        urlHash: `audit-url-${process.pid}`,
        title: "Atomic lease test",
        titleHash: `audit-title-${process.pid}`,
        publishedAt: new Date(),
        lang: "en",
        category: "research",
      },
      include: { source: { select: { name: true, weight: true } } },
    });
    const candidate: CandidateArticle = {
      id: article.id,
      title: article.title,
      summary: article.summary,
      url: article.url,
      lang: article.lang,
      publishedAt: article.publishedAt,
      signals: article.signals,
      aiAttempts: article.aiAttempts,
      source: article.source,
    };

    const claims = await Promise.all([
      claimEnrichmentCandidate(candidate),
      claimEnrichmentCandidate(candidate),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const stored = await prisma.article.findUniqueOrThrow({ where: { id: article.id } });
    expect(stored.aiStatus).toBe("processing");
    expect(stored.aiAttempts).toBe(1);
  });

  it("terminalizes a crashed sixth attempt after lease expiry", async () => {
    const row = await prisma.article.findFirstOrThrow({ where: { sourceId } });
    await prisma.article.update({
      where: { id: row.id },
      data: {
        aiStatus: "processing",
        aiAttempts: 6,
        aiLeaseUntil: new Date(Date.now() - 1_000),
      },
    });
    expect(await recoverExhaustedEnrichmentLeases()).toBe(1);
    const stored = await prisma.article.findUniqueOrThrow({ where: { id: row.id } });
    expect(stored.aiStatus).toBe("failed");
    expect(stored.aiLeaseUntil).toBeNull();
  });
});
