/**
 * Shared in-memory IP token buckets for public fetch endpoints.
 * One web process (PM2 fork); counters resetting on restart is accepted.
 */

type Bucket = { count: number; resetAt: number };
type Store = { buckets: Map<string, Bucket> };

const g = globalThis as typeof globalThis & {
  __hotai_ip_limiters?: Map<string, Store>;
};

function store(name: string): Store {
  const all = (g.__hotai_ip_limiters ??= new Map());
  let s = all.get(name);
  if (!s) {
    s = { buckets: new Map() };
    all.set(name, s);
  }
  return s;
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

export function limitIp(
  name: string,
  ip: string,
  opts: { limit: number; windowMs?: number; maxKeys?: number },
): RateLimitResult {
  const windowMs = opts.windowMs ?? 60_000;
  const maxKeys = opts.maxKeys ?? 2048;
  const now = Date.now();
  const { buckets } = store(name);
  if (buckets.size >= maxKeys) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }
  const bucket = buckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(ip, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (bucket.count >= opts.limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  bucket.count++;
  return { ok: true };
}

/** Test helper — not used in production routes. */
export function resetIpRateLimit(name?: string): void {
  const all = g.__hotai_ip_limiters;
  if (!all) return;
  if (name) all.delete(name);
  else all.clear();
}
