// Deterministic isolated test corpus. Never run against a production database.
if (!/^\/[a-z0-9_]*_test$/.test(new URL(process.env.DATABASE_URL || "http://invalid").pathname)) {
  throw new Error("Test fixtures require an explicit DATABASE_URL ending in _test");
}
const { prisma } = await import("../packages/db/dist/index.js");
try {
  const source = await prisma.source.upsert({ where: { slug: "regression-fixture" },
    create: { slug: "regression-fixture", name: "Regression fixture", url: "https://example.com/rss", homepage: "https://example.com", type: "rss", lang: "en", category: "research", lastFetch: new Date() },
    update: { enabled: true, lastFetch: new Date(), autoPausedUntil: null },
  });
  for (let i = 0; i < 86; i++) {
    const url = `https://example.com/regression-story-${i}`;
    const data = { sourceId: source.id, url, urlHash: `regression-url-${i}`, titleHash: `regression-title-${i}`,
      title: `Regression story ${String(i).padStart(2, "0")}`, summary: "Deterministic local test article.",
      category: "research", lang: "en", score: i, publishedAt: new Date(Date.now() - i * 60_000), aiTopics: ["regression"] };
    await prisma.article.upsert({ where: { url }, create: data, update: data });
  }
  console.log("Seeded 86 deterministic test articles.");
} finally { await prisma.$disconnect(); }
