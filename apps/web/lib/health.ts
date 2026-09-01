import { createHash, timingSafeEqual } from "node:crypto";
import { AI_DIGEST_ENABLED, AI_ENABLED } from "@hotai/ai";
import { prisma } from "./db";

const AI_STATES = ["pending", "processing", "retry", "success", "failed"] as const;
type AiState = (typeof AI_STATES)[number];

export type HealthSnapshot = {
  ok: true;
  ready: boolean;
  status: "ok" | "degraded";
  checkedAt: string;
  collectionMs: number;
  database: { ok: true; latencyMs: number };
  freshness: {
    articles24h: number;
    lastFetchAt: string | null;
    lastFetchAgeSec: number | null;
    maxFetchAgeSec: number;
  };
  sources: {
    total: number;
    enabled: number;
    disabled: number;
    failing: number;
    degraded: number;
    staleEnabled: number;
  };
  ai: {
    enabled: boolean;
    digestEnabled: boolean;
    articles: Record<AiState, number>;
    expiredLeases: number;
  };
  ask: {
    day: string;
    usedTokens: number;
    reservedTokens: number;
    activeReservations: number;
    expiredReservations: number;
  };
  digest: {
    present: boolean;
    generatedAt: string | null;
    ageSec: number | null;
    generationRunning: boolean;
    generationLeaseExpired: boolean;
  };
  fetcher: {
    running: boolean;
    leaseExpired: boolean;
    lastStatus: string | null;
    startedAt: string | null;
    heartbeatAt: string | null;
    lastFinishedAt: string | null;
  };
  rateLimit: { activeBuckets: number };
  warnings: string[];
};

type HealthCache = {
  value?: HealthSnapshot;
  expiresAt?: number;
  pending?: Promise<HealthSnapshot>;
};

const g = globalThis as typeof globalThis & { __hotai_health_cache?: HealthCache };

function startOfUtcDay(now: Date): Date {
  const day = new Date(now);
  day.setUTCHours(0, 0, 0, 0);
  return day;
}

function bounded(env: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(env);
  const value = Number.isFinite(n) && env !== undefined && env !== "" ? n : fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

const HEALTH_CACHE_MS = bounded(process.env.HEALTH_CACHE_SECONDS, 5, 1, 60) * 1000;
export const HEALTH_MAX_FETCH_AGE_SEC = bounded(
  process.env.HEALTH_MAX_FETCH_AGE_SECONDS,
  10_800,
  60,
  7 * 24 * 3600,
);

export function evaluatePipelineReadiness(input: {
  enabledSources: number;
  lastFetchAgeSec: number | null;
  maxFetchAgeSec: number;
  staleEnabledSources: number;
  expiredAiLeases: number;
  fetcherLeaseExpired: boolean;
}): { ready: boolean; warnings: string[] } {
  const warnings: string[] = [];
  if (input.enabledSources === 0) warnings.push("no-enabled-sources");
  if (input.lastFetchAgeSec === null) warnings.push("fetcher-has-no-successful-fetch");
  else if (input.lastFetchAgeSec > input.maxFetchAgeSec) warnings.push("fetcher-stale");
  if (input.staleEnabledSources > 0) warnings.push("stale-enabled-sources");
  if (input.expiredAiLeases > 0) warnings.push("expired-ai-leases");
  if (input.fetcherLeaseExpired) warnings.push("expired-fetcher-cycle-lease");

  return {
    ready:
      input.enabledSources > 0 &&
      input.lastFetchAgeSec !== null &&
      input.lastFetchAgeSec <= input.maxFetchAgeSec,
    warnings,
  };
}

export async function collectHealthSnapshotCached(): Promise<HealthSnapshot> {
  const cache = (g.__hotai_health_cache ??= {});
  const now = Date.now();
  if (cache.value && (cache.expiresAt ?? 0) > now) return cache.value;
  if (cache.pending) return cache.pending;

  const pending = collectHealthSnapshot().then((value) => {
    cache.value = value;
    cache.expiresAt = Date.now() + HEALTH_CACHE_MS;
    return value;
  });
  cache.pending = pending;
  try {
    return await pending;
  } finally {
    if (cache.pending === pending) cache.pending = undefined;
  }
}

export async function collectHealthSnapshot(now = new Date()): Promise<HealthSnapshot> {
  const collectionStarted = Date.now();
  const pingStarted = Date.now();
  await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1::int AS ok`;
  const databaseLatencyMs = Date.now() - pingStarted;

  const since24h = new Date(now.getTime() - 24 * 3600 * 1000);
  const quotaDay = startOfUtcDay(now);
  const digestLeaseName = `digest:${quotaDay.toISOString().slice(0, 10)}`;
  const [
    articles24h,
    sourceRows,
    aiGroups,
    expiredAiLeases,
    askUsage,
    askReservations,
    expiredAskReservations,
    digest,
    coordination,
    activeRateBuckets,
  ] = await Promise.all([
    prisma.article.count({ where: { publishedAt: { gte: since24h } } }),
    prisma.source.findMany({
      select: { enabled: true, lastFetch: true, consecutiveFails: true, lastError: true },
    }),
    prisma.article.groupBy({ by: ["aiStatus"], _count: { _all: true } }),
    prisma.article.count({
      where: { aiStatus: "processing", aiLeaseUntil: { lte: now } },
    }),
    prisma.askDailyUsage.findUnique({ where: { day: quotaDay } }),
    prisma.askReservation.aggregate({
      where: { expiresAt: { gt: now } },
      _count: { _all: true },
      _sum: { reservedTokens: true },
    }),
    prisma.askReservation.count({ where: { expiresAt: { lte: now } } }),
    prisma.digest.findUnique({ where: { date: quotaDay } }),
    prisma.coordinationLease.findMany({
      where: { name: { in: ["fetcher-cycle", digestLeaseName] } },
    }),
    prisma.rateLimitBucket.count({ where: { resetAt: { gt: now } } }),
  ]);

  const enabledRows = sourceRows.filter((source) => source.enabled);
  const fetchTimes = enabledRows
    .map((source) => source.lastFetch?.getTime())
    .filter((value): value is number => typeof value === "number");
  const latestFetchMs = fetchTimes.length > 0 ? Math.max(...fetchTimes) : null;
  const lastFetchAgeSec = latestFetchMs === null
    ? null
    : Math.max(0, Math.floor((now.getTime() - latestFetchMs) / 1000));
  const staleEnabled = enabledRows.filter((source) => {
    if (!source.lastFetch) return true;
    return now.getTime() - source.lastFetch.getTime() > HEALTH_MAX_FETCH_AGE_SEC * 1000;
  }).length;

  const aiArticles = Object.fromEntries(AI_STATES.map((state) => [state, 0])) as Record<AiState, number>;
  for (const row of aiGroups) {
    if (AI_STATES.includes(row.aiStatus as AiState)) {
      aiArticles[row.aiStatus as AiState] = row._count._all;
    }
  }

  const fetcherLease = coordination.find((lease) => lease.name === "fetcher-cycle");
  const digestLease = coordination.find((lease) => lease.name === digestLeaseName);
  const fetcherRunning = Boolean(
    fetcherLease?.lastStatus === "running" && fetcherLease.leaseUntil.getTime() > now.getTime(),
  );
  const fetcherLeaseExpired = Boolean(
    fetcherLease?.lastStatus === "running" && fetcherLease.leaseUntil.getTime() <= now.getTime(),
  );
  const digestGenerationRunning = Boolean(
    digestLease?.lastStatus === "running" && digestLease.leaseUntil.getTime() > now.getTime(),
  );
  const digestGenerationLeaseExpired = Boolean(
    digestLease?.lastStatus === "running" && digestLease.leaseUntil.getTime() <= now.getTime(),
  );
  const readiness = evaluatePipelineReadiness({
    enabledSources: enabledRows.length,
    lastFetchAgeSec,
    maxFetchAgeSec: HEALTH_MAX_FETCH_AGE_SEC,
    staleEnabledSources: staleEnabled,
    expiredAiLeases,
    fetcherLeaseExpired,
  });
  const warnings = [...readiness.warnings];
  const degradedSources = enabledRows.filter(
    (source) => source.consecutiveFails === 0 && Boolean(source.lastError),
  ).length;
  if (degradedSources > 0) warnings.push("degraded-sources");
  if (expiredAskReservations > 0) warnings.push("expired-ask-reservations");
  if (digestGenerationLeaseExpired) warnings.push("expired-digest-generation-lease");
  if (fetcherLease?.lastStatus === "failed") warnings.push("fetcher-last-cycle-failed");
  else if (fetcherLease?.lastStatus === "degraded") warnings.push("fetcher-last-cycle-degraded");
  if (!digest && digestLease?.lastStatus === "failed") warnings.push("digest-generation-failed");

  return {
    ok: true,
    ready: readiness.ready,
    status: warnings.length === 0 ? "ok" : "degraded",
    checkedAt: now.toISOString(),
    collectionMs: Date.now() - collectionStarted,
    database: { ok: true, latencyMs: databaseLatencyMs },
    freshness: {
      articles24h,
      lastFetchAt: latestFetchMs === null ? null : new Date(latestFetchMs).toISOString(),
      lastFetchAgeSec,
      maxFetchAgeSec: HEALTH_MAX_FETCH_AGE_SEC,
    },
    sources: {
      total: sourceRows.length,
      enabled: enabledRows.length,
      disabled: sourceRows.length - enabledRows.length,
      failing: enabledRows.filter((source) => source.consecutiveFails > 0).length,
      degraded: degradedSources,
      staleEnabled,
    },
    ai: {
      enabled: AI_ENABLED,
      digestEnabled: AI_DIGEST_ENABLED,
      articles: aiArticles,
      expiredLeases: expiredAiLeases,
    },
    ask: {
      day: quotaDay.toISOString().slice(0, 10),
      usedTokens: askUsage?.usedTokens ?? 0,
      reservedTokens: askReservations._sum.reservedTokens ?? 0,
      activeReservations: askReservations._count._all,
      expiredReservations: expiredAskReservations,
    },
    digest: {
      present: Boolean(digest),
      generatedAt: digest?.createdAt.toISOString() ?? null,
      ageSec: digest ? Math.max(0, Math.floor((now.getTime() - digest.createdAt.getTime()) / 1000)) : null,
      generationRunning: digestGenerationRunning,
      generationLeaseExpired: digestGenerationLeaseExpired,
    },
    fetcher: {
      running: fetcherRunning,
      leaseExpired: fetcherLeaseExpired,
      lastStatus: fetcherLease?.lastStatus ?? null,
      startedAt: fetcherLease?.startedAt.toISOString() ?? null,
      heartbeatAt: fetcherLease?.heartbeatAt.toISOString() ?? null,
      lastFinishedAt: fetcherLease?.lastFinishedAt?.toISOString() ?? null,
    },
    rateLimit: { activeBuckets: activeRateBuckets },
    warnings,
  };
}

export function isObservabilityAuthorized(request: Request, token: string | undefined): boolean {
  const expected = token?.trim() ?? "";
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match?.[1]) return false;
  const expectedDigest = createHash("sha256").update(expected).digest();
  const actualDigest = createHash("sha256").update(match[1].trim()).digest();
  return timingSafeEqual(expectedDigest, actualDigest);
}

export function formatPrometheus(snapshot: HealthSnapshot): string {
  const age = (value: number | null): number => value ?? -1;
  const timestamp = (value: string | null): number =>
    value ? Math.floor(new Date(value).getTime() / 1000) : 0;
  const lines = [
    "# HELP hotai_up Whether the web process and database snapshot are available.",
    "# TYPE hotai_up gauge",
    "hotai_up 1",
    "# HELP hotai_ready Whether database-backed content is fresh enough to serve.",
    "# TYPE hotai_ready gauge",
    `hotai_ready ${snapshot.ready ? 1 : 0}`,
    "# TYPE hotai_health_warning_count gauge",
    `hotai_health_warning_count ${snapshot.warnings.length}`,
    "# TYPE hotai_db_query_duration_seconds gauge",
    `hotai_db_query_duration_seconds ${(snapshot.database.latencyMs / 1000).toFixed(3)}`,
    "# TYPE hotai_articles_published_24h gauge",
    `hotai_articles_published_24h ${snapshot.freshness.articles24h}`,
    "# TYPE hotai_source_last_fetch_age_seconds gauge",
    `hotai_source_last_fetch_age_seconds ${age(snapshot.freshness.lastFetchAgeSec)}`,
    "# TYPE hotai_sources gauge",
    `hotai_sources{state="enabled"} ${snapshot.sources.enabled}`,
    `hotai_sources{state="disabled"} ${snapshot.sources.disabled}`,
    `hotai_sources{state="failing"} ${snapshot.sources.failing}`,
    `hotai_sources{state="degraded"} ${snapshot.sources.degraded}`,
    `hotai_sources{state="stale"} ${snapshot.sources.staleEnabled}`,
    "# TYPE hotai_ai_articles gauge",
    ...AI_STATES.map((state) => `hotai_ai_articles{status="${state}"} ${snapshot.ai.articles[state]}`),
    "# TYPE hotai_ai_expired_leases gauge",
    `hotai_ai_expired_leases ${snapshot.ai.expiredLeases}`,
    "# TYPE hotai_ask_used_tokens gauge",
    `hotai_ask_used_tokens ${snapshot.ask.usedTokens}`,
    "# TYPE hotai_ask_reserved_tokens gauge",
    `hotai_ask_reserved_tokens ${snapshot.ask.reservedTokens}`,
    "# TYPE hotai_ask_active_reservations gauge",
    `hotai_ask_active_reservations ${snapshot.ask.activeReservations}`,
    "# TYPE hotai_ask_expired_reservations gauge",
    `hotai_ask_expired_reservations ${snapshot.ask.expiredReservations}`,
    "# TYPE hotai_digest_present gauge",
    `hotai_digest_present ${snapshot.digest.present ? 1 : 0}`,
    "# TYPE hotai_digest_age_seconds gauge",
    `hotai_digest_age_seconds ${age(snapshot.digest.ageSec)}`,
    "# TYPE hotai_digest_generation_running gauge",
    `hotai_digest_generation_running ${snapshot.digest.generationRunning ? 1 : 0}`,
    "# TYPE hotai_digest_generation_lease_expired gauge",
    `hotai_digest_generation_lease_expired ${snapshot.digest.generationLeaseExpired ? 1 : 0}`,
    "# TYPE hotai_fetcher_cycle_running gauge",
    `hotai_fetcher_cycle_running ${snapshot.fetcher.running ? 1 : 0}`,
    "# TYPE hotai_fetcher_cycle_lease_expired gauge",
    `hotai_fetcher_cycle_lease_expired ${snapshot.fetcher.leaseExpired ? 1 : 0}`,
    "# TYPE hotai_fetcher_cycle_last_finished_timestamp_seconds gauge",
    `hotai_fetcher_cycle_last_finished_timestamp_seconds ${timestamp(snapshot.fetcher.lastFinishedAt)}`,
    "# TYPE hotai_rate_limit_active_buckets gauge",
    `hotai_rate_limit_active_buckets ${snapshot.rateLimit.activeBuckets}`,
  ];
  return `${lines.join("\n")}\n`;
}
