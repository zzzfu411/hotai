import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Prisma reads DATABASE_URL from process.env. Next/tsx often start with
 * cwd=apps/web|fetcher, so the repo-root `.env` is not auto-loaded.
 * Walk up from cwd (and this file) and apply the first `.env` found.
 * Existing process.env wins (override: false).
 */
function applyEnvFile(file: string) {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function walkForEnv(start: string): string | null {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    const candidate = resolve(dir, ".env");
    if (existsSync(candidate)) return candidate;
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function loadRepoEnv() {
  const starts = [process.cwd()];
  try {
    starts.push(resolve(dirname(fileURLToPath(import.meta.url)), "../../.."));
  } catch {
    /* webpack / cjs */
  }
  const seen = new Set<string>();
  for (const start of starts) {
    const file = walkForEnv(start);
    if (file && !seen.has(file)) {
      seen.add(file);
      applyEnvFile(file);
    }
  }
}

loadRepoEnv();
