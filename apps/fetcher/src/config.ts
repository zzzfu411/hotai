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
};
