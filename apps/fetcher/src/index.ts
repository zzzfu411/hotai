import "dotenv/config";
import cron from "node-cron";
import { prisma } from "@hotai/db";
import { runCycle } from "./cycle.js";
import { config } from "./config.js";

async function main(): Promise<void> {
  const once = process.argv.includes("--once");
  if (once) {
    await runCycle();
    await prisma.$disconnect();
    return;
  }
  console.log(`[fetcher] scheduler started, cron="${config.cron}"`);
  await runCycle().catch((e) => console.error("[fetcher] initial run failed:", e));
  cron.schedule(config.cron, () => {
    runCycle().catch((e) => console.error("[fetcher] scheduled run failed:", e));
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
