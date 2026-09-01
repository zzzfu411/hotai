import "dotenv/config";
import cron from "node-cron";
import { prisma } from "@hotai/db";
import { config } from "./config.js";

let running = false;
type RunCycle = typeof import("./cycle.js").runCycle;
let runCycle: RunCycle | undefined;

async function guardedCycle(label: string): Promise<void> {
  if (running) {
    console.warn(`[fetcher] skip overlapping cycle (${label})`);
    return;
  }
  running = true;
  try {
    if (!runCycle) throw new Error("fetch cycle is not initialized");
    await runCycle();
  } finally {
    running = false;
  }
}

async function main(): Promise<void> {
  // Keep a side-effect-light production smoke path: importing the compiled
  // graph must succeed without opening a database connection or scheduler.
  if (process.argv.includes("--smoke")) {
    console.log("[fetcher] compiled dist smoke passed");
    await prisma.$disconnect();
    return;
  }
  // Load the heavier source adapters only after the smoke guard. This keeps
  // `node dist/index.js --smoke` useful on a production-only install and
  // avoids eagerly constructing parser dependencies before configuration is
  // checked.
  ({ runCycle } = await import("./cycle.js"));
  const once = process.argv.includes("--once");
  if (once) {
    await runCycle();
    await prisma.$disconnect();
    return;
  }
  if (!cron.validate(config.cron)) {
    throw new Error(`FETCHER_CRON is invalid: ${JSON.stringify(config.cron)}`);
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
