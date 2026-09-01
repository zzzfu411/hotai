import "dotenv/config";

function num(env: string | undefined, fallback: number): number {
  const n = Number(env);
  return Number.isFinite(n) && env !== undefined && env !== "" ? n : fallback;
}

function bounded(env: string | undefined, fallback: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, num(env, fallback)));
}

function revalidateUrl(env: string | undefined): string {
  const raw = env?.trim() ?? "";
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    const loopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]";
    if ((parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) || parsed.username || parsed.password) {
      console.warn("[config] REVALIDATE_URL must be HTTPS (HTTP is allowed only for loopback) and must not contain credentials");
      return "";
    }
    return parsed.toString();
  } catch {
    console.warn("[config] REVALIDATE_URL is invalid; revalidation notifications disabled");
    return "";
  }
}

export const config = {
  userAgent:
    process.env.FETCHER_USER_AGENT ||
    "HotAI-Bot/0.1 (+https://hotai.yeuxark.com)",
  cron: process.env.FETCHER_CRON || "7 * * * *",
  halfLifeHours: bounded(process.env.SCORING_HALFLIFE_HOURS, 24, 1, 8_760),
  // Stored lowercased — scoring matches against lowercased text.
  keywords: (
    process.env.SCORING_KEYWORDS ||
    "GPT,Claude,Gemini,LLM,Llama,Mistral,DeepSeek,Qwen,OpenAI,Anthropic,Sora,o1,o3"
  )
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  revalidateUrl: revalidateUrl(process.env.REVALIDATE_URL),
  revalidateSecret: process.env.REVALIDATE_SECRET || "",
  fetchTimeoutMs: bounded(process.env.FETCH_TIMEOUT_MS, 20_000, 1_000, 120_000),
  fetchMaxBytes: Math.trunc(
    bounded(process.env.FETCH_MAX_BYTES, 1_572_864, 64 * 1024, 8 * 1024 * 1024),
  ),
  perSourceLimit: Math.trunc(bounded(process.env.PER_SOURCE_LIMIT, 40, 1, 200)),
  // Parallel upstream fetches; persist stays sequential so urlHash/titleHash
  // dedupe sees rows written by earlier sources in the same cycle.
  fetchConcurrency: Math.max(1, Math.min(8, num(process.env.FETCH_CONCURRENCY, 4))),
  // Hard retention — articles older than this are wiped each cycle.
  // Project policy: keep 2 weeks; the homepage focus is "today's hot", not archive.
  retentionDays: bounded(process.env.ARTICLE_RETENTION_DAYS, 14, 1, 3_650),
  // Cross-source repost dedupe: a new item whose titleHash matches an article
  // published within this window is merged into it instead of creating a row.
  titleDedupeWindowDays: bounded(process.env.TITLE_DEDUPE_WINDOW_DAYS, 3, 0, 30),
  // A source failing this many consecutive cycles is auto-disabled
  // (Source.enabled=false) so dead feeds surface instead of rotting silently.
  sourceFailThreshold: bounded(process.env.SOURCE_FAIL_THRESHOLD, 5, 1, 100),
  // AI enrichment knobs — only used when ANTHROPIC_API_KEY is set.
  aiEnrichPerRun: bounded(process.env.AI_ENRICH_PER_RUN, 30, 0, 1_000),
  aiConcurrency: bounded(process.env.AI_CONCURRENCY, 4, 1, 16),
  // Articles per LLM call. 1 = legacy article-per-call behaviour.
  aiBatchSize: Math.max(1, Math.min(20, num(process.env.AI_BATCH_SIZE, 10))),
  // How strongly the LLM's 0-1 importance feeds the ranking formula.
  // 2.0 means importance 0.9 ≈ +1.8 base score — about an OpenAI-weight source.
  aiImportanceWeight: bounded(process.env.AI_IMPORTANCE_WEIGHT, 2.0, 0, 10),
  aiDigestEnabled: (process.env.AI_DIGEST_ENABLED ?? "true").toLowerCase() !== "false",
  // Durable singleton leases. The fetcher renews its cycle lease while work
  // is running; digest generation is short enough to use one fixed lease.
  cycleLeaseMs:
    bounded(process.env.FETCHER_CYCLE_LEASE_SECONDS, 300, 120, 3_600) * 1000,
  digestLeaseMs:
    bounded(process.env.DIGEST_GENERATION_LEASE_SECONDS, 300, 120, 3_600) * 1000,
  // /api/ask answer cache TTL — the fetcher's retention pass deletes older rows.
  askCacheTtlHours: bounded(process.env.ASK_CACHE_TTL_HOURS, 24, 1, 720),
};
