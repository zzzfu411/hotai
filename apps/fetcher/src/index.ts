import "dotenv/config";
import cron from "node-cron";
import { prisma } from "@hotai/db";
import { fetchSource } from "./dispatch.js";
import { upsertArticles } from "./store.js";
import { config } from "./config.js";

async function runOnce(): Promise<void> {
  const started = Date.now();
  const sources = await prisma.source.findMany({ where: { enabled: true } });
  console.log(`[fetcher] cycle start — ${sources.length} sources`);
  let total = 0;
  let okCount = 0;
  let failCount = 0;
  for (const src of sources) {
    try {
      console.log(`  → ${src.slug} (${src.type})`);
      const items = await fetchSource(src);
      const written = await upsertArticles(src, items);
      total += written;
      okCount++;
      await prisma.source.update({
        where: { id: src.id },
        data: { lastFetch: new Date() },
      });
      console.log(`    ✓ ${items.length} items, ${written} upserted`);
    } catch (err) {
      failCount++;
      console.error(`    ✗ ${src.slug}:`, (err as Error).message);
    }
  }
  const ms = Date.now() - started;
  console.log(`[fetcher] cycle done — ${okCount} ok, ${failCount} failed, ${total} upserted, ${ms}ms`);
  await notifyRevalidate();
}

async function notifyRevalidate(): Promise<void> {
  if (!config.revalidateUrl || !config.revalidateSecret) return;
  try {
    const res = await fetch(config.revalidateUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-revalidate-secret": config.revalidateSecret,
      },
      body: JSON.stringify({ paths: ["/"] }),
    });
    console.log(`[fetcher] revalidate -> ${res.status}`);
  } catch (err) {
    console.warn(`[fetcher] revalidate failed:`, (err as Error).message);
  }
}

async function main(): Promise<void> {
  const once = process.argv.includes("--once");
  if (once) {
    await runOnce();
    await prisma.$disconnect();
    return;
  }
  console.log(`[fetcher] scheduler started, cron="${config.cron}"`);
  // Run on startup, then on schedule
  await runOnce().catch((e) => console.error("[fetcher] initial run failed:", e));
  cron.schedule(config.cron, () => {
    runOnce().catch((e) => console.error("[fetcher] scheduled run failed:", e));
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
