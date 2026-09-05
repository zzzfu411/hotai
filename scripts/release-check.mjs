/** Read-only content gate. Run against the intended release database before promotion. */
import { readdir } from "node:fs/promises";
import { prisma } from "../packages/db/dist/index.js";

try {
  const [migrations, applied, sources, articles] = await Promise.all([
    readdir(new URL("../packages/db/prisma/migrations/", import.meta.url), { withFileTypes: true }),
    prisma.$queryRaw`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    prisma.source.count({ where: { enabled: true } }),
    prisma.article.count({ where: { publishedAt: {
      gte: new Date(Date.now() - 14 * 86400_000), lte: new Date(),
    } } }),
  ]);
  const installed = new Set(applied.map((row) => row.migration_name));
  const missing = migrations.filter((entry) => entry.isDirectory() && !installed.has(entry.name));
  if (missing.length) throw new Error(`Unapplied migrations: ${missing.map((entry) => entry.name).join(", ")}`);
  if (!sources || !articles) throw new Error("The release has no enabled sources or recent articles. Seed and run the content pipeline before promotion.");
  if (process.env.RELEASE_BASE_URL) {
    const target = process.env.RELEASE_BASE_URL;
    const health = await fetch(new URL("/api/health", target), { signal: AbortSignal.timeout(15_000) });
    if (!health.ok || !(await health.json()).ready) throw new Error("The release service is not ready.");
    process.env.SMOKE_BASE_URL = target;
    await import("./smoke-catalog.mjs");
    if (process.exitCode) throw new Error("The release live RSS probe failed.");
  }
  console.log(`[release] ${process.env.RELEASE_BASE_URL ? "service + database" : "database"} ready: ${sources} enabled sources, ${articles} recent articles, all migrations applied`);
} catch (error) {
  // Never print credentials or raw provider configuration in a release log.
  console.error("[release] NOT READY: database, migrations, or content checks failed.");
  if (error instanceof Error && /^(Unapplied|The release)/.test(error.message)) console.error(error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
