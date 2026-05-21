import "dotenv/config";

export const config = {
  userAgent:
    process.env.FETCHER_USER_AGENT ||
    "HotAI-Bot/0.1 (+https://hotai.example.com)",
  cron: process.env.FETCHER_CRON || "7 * * * *",
  halfLifeHours: Number(process.env.SCORING_HALFLIFE_HOURS ?? 24),
  keywords: (
    process.env.SCORING_KEYWORDS ||
    "GPT,Claude,Gemini,LLM,Llama,Mistral,DeepSeek,Qwen,OpenAI,Anthropic,Sora,o1,o3"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  revalidateUrl: process.env.REVALIDATE_URL || "",
  revalidateSecret: process.env.REVALIDATE_SECRET || "",
  fetchTimeoutMs: 20_000,
  perSourceLimit: 40,
  // Hard retention — articles older than this are wiped each cycle.
  // Project policy: keep 2 weeks; the homepage focus is "today's hot", not archive.
  retentionDays: Number(process.env.ARTICLE_RETENTION_DAYS ?? 14),
  // AI enrichment knobs — only used when ANTHROPIC_API_KEY is set.
  aiEnrichPerRun: Number(process.env.AI_ENRICH_PER_RUN ?? 30),
  aiConcurrency: Number(process.env.AI_CONCURRENCY ?? 4),
  aiDigestEnabled: (process.env.AI_DIGEST_ENABLED ?? "true").toLowerCase() !== "false",
};
