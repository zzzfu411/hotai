import { createHash } from "node:crypto";
import { isIP } from "node:net";

/**
 * Guard rails for the public /api/ask endpoint — the only place where an
 * anonymous visitor can directly spend LLM tokens:
 *
 *   1. per-IP token bucket        (ASK_RATE_PER_IP, "5/60" = 5 req / 60s)
 *   2. answer cache               (AskCache table; keyed on normalized question)
 *   3. PostgreSQL-backed daily quota/global concurrency (see ask-quota.ts)
 *
 * The per-IP bucket is an application fallback; Nginx also enforces the same
 * public route across processes. Cost and concurrency state must be durable.
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
};

// Survive Next dev hot-reload, same trick as the Prisma singleton.
const g = globalThis as typeof globalThis & { __hotai_ask_guard?: AskGuardState };
const state: AskGuardState = g.__hotai_ask_guard ?? {
  buckets: new Map(),
};
if (process.env.NODE_ENV !== "production") g.__hotai_ask_guard = state;

export function clientIp(req: Request): string {
  // The supplied Nginx config overwrites these headers with the connection
  // address. Prefer that canonical single-hop value and only use the
  // right-most forwarded address as a compatibility fallback. Never trust a
  // left-most, client-supplied X-Forwarded-For entry.
  const real = normalizeIp(req.headers.get("x-real-ip"));
  if (real) return real;
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const parts = fwd.split(",").map((part) => normalizeIp(part)).filter((part): part is string => Boolean(part));
    if (parts.length > 0) return parts[parts.length - 1]!;
  }
  return "unknown";
}

function normalizeIp(raw: string | null): string | null {
  const value = raw?.trim() ?? "";
  if (!value) return null;
  const unwrapped = value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
  return isIP(unwrapped) ? unwrapped : null;
}

export function rateLimit(ip: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  sweep(now);
  const bucket = state.buckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    if (!bucket && state.buckets.size >= 2048) {
      return { ok: false, retryAfterSec: earliestResetSec(now) };
    }
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

function earliestResetSec(now: number): number {
  let earliest = now + RATE.windowMs;
  for (const bucket of state.buckets.values()) earliest = Math.min(earliest, bucket.resetAt);
  return Math.max(1, Math.ceil((earliest - now) / 1000));
}

/** Cache key for a question — trims, lowercases, hashes. */
export function questionKey(question: string): string {
  return createHash("sha1").update(question.trim().toLowerCase()).digest("hex");
}

/**
 * Conservative token estimate for the pre-flight quota reservation. A plain
 * UTF-16 character count substantially underestimates CJK and emoji prompts,
 * so two UTF-8 bytes per token is intentionally a little pessimistic for
 * English while remaining safer for this multilingual corpus.
 */
export function estimateTokens(text: string): number {
  const bytes = new TextEncoder().encode(text).byteLength;
  return Math.max(1, Math.ceil(bytes / 2));
}
