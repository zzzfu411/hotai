import "dotenv/config";

function num(env: string | undefined, fallback: number): number {
  const n = Number(env);
  return Number.isFinite(n) && env !== undefined && env !== "" ? n : fallback;
}

export const config = {
  userAgent:
    process.env.FETCHER_USER_AGENT ||
    "HotAI-Bot/0.1 (+https://hotai.example.com)",
  cron: process.env.FETCHER_CRON || "7 * * * *",
  halfLifeHours: num(process.env.SCORING_HALFLIFE_HOURS, 24),
  // Stored lowercased — scoring matches against lowercased text.
  keywords: (
    process.env.SCORING_KEYWORDS ||
    "GPT,Claude,Gemini,LLM,Llama,Mistral,DeepSeek,Qwen,OpenAI,Anthropic,Sora,o1,o3"
  )
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  revalidateUrl: process.env.REVALIDATE_URL || "",
  revalidateSecret: process.env.REVALIDATE_SECRET || "",
  fetchTimeoutMs: 20_000,
  perSourceLimit: 40,
  // Hard retention — articles older than this are wiped each cycle.
  // Project policy: keep 2 weeks; the homepage focus is "today's hot", not archive.
  retentionDays: num(process.env.ARTICLE_RETENTION_DAYS, 14),
  // Cross-source repost dedupe: a new item whose titleHash matches an article
  // published within this window is merged into it instead of creating a row.
  titleDedupeWindowDays: num(process.env.TITLE_DEDUPE_WINDOW_DAYS, 3),
  // A source failing this many consecutive cycles is auto-disabled
  // (Source.enabled=false) so dead feeds surface instead of rotting silently.
  sourceFailThreshold: num(process.env.SOURCE_FAIL_THRESHOLD, 5),
  // AI enrichment knobs — only used when ANTHROPIC_API_KEY is set.
  aiEnrichPerRun: num(process.env.AI_ENRICH_PER_RUN, 30),
  aiConcurrency: num(process.env.AI_CONCURRENCY, 4),
  // Articles per LLM call. 1 = legacy article-per-call behaviour.
  aiBatchSize: Math.max(1, Math.min(20, num(process.env.AI_BATCH_SIZE, 10))),
  // How strongly the LLM's 0-1 importance feeds the ranking formula.
  // 2.0 means importance 0.9 ≈ +1.8 base score — about an OpenAI-weight source.
  aiImportanceWeight: num(process.env.AI_IMPORTANCE_WEIGHT, 2.0),
  aiDigestEnabled: (process.env.AI_DIGEST_ENABLED ?? "true").toLowerCase() !== "false",
  // /api/ask answer cache TTL — the fetcher's retention pass deletes older rows.
  askCacheTtlHours: num(process.env.ASK_CACHE_TTL_HOURS, 24),
};
