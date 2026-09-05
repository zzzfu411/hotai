import { describe, expect, it } from "vitest";
import {
  evaluatePipelineReadiness,
  formatPrometheus,
  isObservabilityAuthorized,
  type HealthSnapshot,
} from "./health";

describe("health readiness", () => {
  it("is ready when at least one enabled source fetched recently", () => {
    expect(
      evaluatePipelineReadiness({
        enabledSources: 4,
        lastFetchAgeSec: 120,
        maxFetchAgeSec: 10_800,
        staleEnabledSources: 0,
        expiredAiLeases: 0,
        fetcherLeaseExpired: false,
      }),
    ).toEqual({ ready: true, warnings: [] });
  });

  it("marks a stalled pipeline unready while retaining diagnostic warnings", () => {
    const result = evaluatePipelineReadiness({
      enabledSources: 4,
      lastFetchAgeSec: 20_000,
      maxFetchAgeSec: 10_800,
      staleEnabledSources: 2,
      expiredAiLeases: 3,
      fetcherLeaseExpired: true,
    });
    expect(result.ready).toBe(false);
    expect(result.warnings).toEqual([
      "fetcher-stale",
      "stale-enabled-sources",
      "expired-ai-leases",
      "expired-fetcher-cycle-lease",
    ]);
  });
});

describe("observability authorization", () => {
  it("requires a configured token and an exact Bearer credential", () => {
    expect(isObservabilityAuthorized(new Request("https://example.test"), "")).toBe(false);
    expect(
      isObservabilityAuthorized(
        new Request("https://example.test", { headers: { authorization: "Bearer secret" } }),
        "secret",
      ),
    ).toBe(true);
    expect(
      isObservabilityAuthorized(
        new Request("https://example.test", { headers: { authorization: "Bearer secrets" } }),
        "secret",
      ),
    ).toBe(false);
  });
});

describe("Prometheus formatter", () => {
  it("emits low-cardinality numeric metrics", () => {
    const snapshot: HealthSnapshot = {
      ok: true,
      ready: true,
      status: "degraded",
      checkedAt: "2026-08-31T12:00:00.000Z",
      collectionMs: 9,
      database: { ok: true, latencyMs: 4 },
      catalog: { scope: "process", status: "unknown", fresh: 0, stale: 0, failed: 0, unknown: 35, lastSuccessAt: null },
      freshness: {
        articles24h: 12,
        lastFetchAt: "2026-08-31T11:59:00.000Z",
        lastFetchAgeSec: 60,
        maxFetchAgeSec: 10_800,
      },
      sources: { total: 5, enabled: 4, disabled: 1, autoPaused: 0, failing: 1, degraded: 1, staleEnabled: 0 },
      ai: {
        enabled: true,
        digestEnabled: true,
        articles: { pending: 1, processing: 2, retry: 3, success: 4, failed: 5 },
        expiredLeases: 1,
      },
      ask: {
        day: "2026-08-31",
        usedTokens: 100,
        reservedTokens: 20,
        activeReservations: 1,
        expiredReservations: 2,
      },
      digest: {
        present: true,
        generatedAt: "2026-08-31T10:00:00.000Z",
        ageSec: 7_200,
        generationRunning: false,
        generationLeaseExpired: false,
      },
      fetcher: {
        running: false,
        leaseExpired: false,
        lastStatus: "success",
        startedAt: "2026-08-31T11:58:00.000Z",
        heartbeatAt: "2026-08-31T11:59:00.000Z",
        lastFinishedAt: "2026-08-31T11:59:30.000Z",
      },
      rateLimit: { activeBuckets: 6 },
      warnings: ["expired-ai-leases"],
    };
    const text = formatPrometheus(snapshot);
    expect(text).toContain("hotai_ready 1");
    expect(text).toContain('hotai_ai_articles{status="failed"} 5');
    expect(text).toContain("hotai_ask_reserved_tokens 20");
    expect(text).toContain("hotai_ask_expired_reservations 2");
    expect(text).toContain('hotai_sources{state="degraded"} 1');
    expect(text).not.toContain("secret");
  });
});
