import "dotenv/config";
import cron from "node-cron";
import { prisma } from "@hotai/db";
import { runCycle } from "./cycle.js";
import { config } from "./config.js";

let running = false;

async function guardedCycle(label: string): Promise<void> {
  if (running) {
    console.warn(`[fetcher] skip overlapping cycle (${label})`);
    return;
  }
  running = true;
  try {
    await runCycle();
  } finally {
    running = false;
  }
}

async function main(): Promise<void> {
  const once = process.argv.includes("--once");
  if (once) {
    await runCycle();
    await prisma.$disconnect();
    return;
  }
  console.log(`[fetcher] scheduler started, cron="${config.cron}"`);
  await guardedCycle("startup").catch((e) => console.error("[fetcher] initial run failed:", e));
  cron.schedule(config.cron, () => {
    guardedCycle("cron").catch((e) => console.error("[fetcher] scheduled run failed:", e));
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
