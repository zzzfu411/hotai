import "dotenv/config";
import cron from "node-cron";
import { prisma } from "@hotai/db";
import { AI_ENABLED } from "@hotai/ai";
import { fetchSource } from "./dispatch.js";
import { upsertArticles } from "./store.js";
import { enrichPendingArticles } from "./enrich.js";
import { ensureTodayDigest } from "./digest.js";
import { purgeOldArticles } from "./purge.js";
import { config } from "./config.js";

async function runOnce(): Promise<void> {
  const started = Date.now();
  // Retention pass first — never waste AI calls or ranking work on articles
  // we're about to delete.
  await purgeOldArticles().catch((e) => console.warn("[purge] failed:", (e as Error).message));

  const sources = await prisma.source.findMany({ where: { enabled: true } });
  console.log(`[fetcher] cycle start — ${sources.length} sources, ai=${AI_ENABLED ? "on" : "off"}`);
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
  const fetchMs = Date.now() - started;
  console.log(`[fetcher] fetch done — ${okCount} ok, ${failCount} failed, ${total} upserted, ${fetchMs}ms`);

  // AI enrichment + digest run AFTER fetch so we score with full signal first.
  if (AI_ENABLED) {
    try {
      await enrichPendingArticles();
      if (config.aiDigestEnabled) await ensureTodayDigest();
    } catch (err) {
      console.warn(`[ai] pipeline error:`, (err as Error).message);
    }
  }

  await notifyRevalidate();
  console.log(`[fetcher] cycle total ${Date.now() - started}ms`);
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
      body: JSON.stringify({ paths: ["/", "/digest"] }),
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
  await runOnce().catch((e) => console.error("[fetcher] initial run failed:", e));
  cron.schedule(config.cron, () => {
    runOnce().catch((e) => console.error("[fetcher] scheduled run failed:", e));
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
