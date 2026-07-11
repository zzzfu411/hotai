import { createHash } from "node:crypto";

/**
 * Guard rails for the public /api/ask endpoint — the only place where an
 * anonymous visitor can directly spend LLM tokens:
 *
 *   1. per-IP token bucket        (ASK_RATE_PER_IP, "5/60" = 5 req / 60s)
 *   2. answer cache               (AskCache table; keyed on normalized question)
 *   3. daily output-token valve   (ASK_DAILY_TOKEN_LIMIT, 0 = unlimited)
 *
 * Rate/quota state is in-memory: one web process (PM2 fork mode), and losing
 * the counters on restart is an acceptable failure mode for a cost valve.
 */

function num(env: string | undefined, fallback: number): number {
  const n = Number(env);
  return Number.isFinite(n) && env !== undefined && env !== "" ? n : fallback;
}

function parseRate(spec: string): { limit: number; windowMs: number } {
  const m = spec.match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);
  if (!m) return { limit: 5, windowMs: 60_000 };
  return { limit: Math.max(1, Number(m[1])), windowMs: Math.max(1, Number(m[2])) * 1000 };
}

const RATE = parseRate(process.env.ASK_RATE_PER_IP ?? "5/60");
export const ASK_DAILY_TOKEN_LIMIT = num(process.env.ASK_DAILY_TOKEN_LIMIT, 500_000);
export const ASK_CACHE_TTL_MS = num(process.env.ASK_CACHE_TTL_HOURS, 24) * 3600 * 1000;

type Bucket = { count: number; resetAt: number };
type AskGuardState = {
  buckets: Map<string, Bucket>;
  quota: { day: string; used: number };
};

// Survive Next dev hot-reload, same trick as the Prisma singleton.
const g = globalThis as typeof globalThis & { __hotai_ask_guard?: AskGuardState };
const state: AskGuardState = g.__hotai_ask_guard ?? {
  buckets: new Map(),
  quota: { day: "", used: 0 },
};
if (process.env.NODE_ENV !== "production") g.__hotai_ask_guard = state;

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export function rateLimit(ip: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  sweep(now);
  const bucket = state.buckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    state.buckets.set(ip, { count: 1, resetAt: now + RATE.windowMs });
    return { ok: true };
  }
  if (bucket.count >= RATE.limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  bucket.count++;
  return { ok: true };
}

function sweep(now: number): void {
  if (state.buckets.size < 2048) return;
  for (const [key, bucket] of state.buckets) {
    if (bucket.resetAt <= now) state.buckets.delete(key);
  }
}

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

export function quotaExceeded(): boolean {
  if (ASK_DAILY_TOKEN_LIMIT <= 0) return false;
  const day = utcDay();
  if (state.quota.day !== day) {
    state.quota.day = day;
    state.quota.used = 0;
  }
  return state.quota.used >= ASK_DAILY_TOKEN_LIMIT;
}

export function addQuotaUsage(tokens: number): void {
  const day = utcDay();
  if (state.quota.day !== day) {
    state.quota.day = day;
    state.quota.used = 0;
  }
  state.quota.used += Math.max(0, Math.round(tokens));
}

/** Cache key for a question — trims, lowercases, hashes. */
export function questionKey(question: string): string {
  return createHash("sha1").update(question.trim().toLowerCase()).digest("hex");
}

/** Rough token estimate when the relay doesn't report usage (~4 chars/token). */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
