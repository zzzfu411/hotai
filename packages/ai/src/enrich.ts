import { AI_MODELS, client, parseJson, systemBlock, textOf, AI_ENABLED } from "./client.js";

export type EnrichInput = {
  title: string;
  summary?: string | null;
  url: string;
  sourceName: string;
  lang: "en" | "zh";
};

export type EnrichResult = {
  summaryEn: string;
  summaryZh: string;
  topics: string[];
  sentiment: "release" | "research" | "opinion" | "rumor" | "tutorial" | "other";
  importance: number; // 0-1
  model: string;
};

/**
 * Cached system prompt — pinned so the per-request portion stays small and Anthropic's
 * prompt-cache absorbs the bulk of the tokens across the batch.
 */
const SYSTEM_PROMPT = `You are an editor for an AI-news aggregator. For each article you receive,
output STRICT JSON (no markdown, no commentary) with the schema:

{
  "summary_en": string,   // one tight sentence, <=200 chars, plain English, no hype, no leading "This article"
  "summary_zh": string,   // 一句话中文摘要,<=80 个字,客观,不要"本文"开头
  "topics": string[],     // 3-5 lowercase short tags (e.g. "llm", "open-source", "alignment", "vision", "agents")
  "sentiment": "release" | "research" | "opinion" | "rumor" | "tutorial" | "other",
  "importance": number    // 0.0-1.0; reserve >0.8 for major lab/product launches or landmark papers
}

Rules:
- If the title is non-English, still produce both summary_en (translate) and summary_zh.
- If the input is too thin to be confident, set importance <= 0.3 and keep summary concise.
- Never invent facts not implied by the title/summary. Prefer "details not yet available" over hallucination.`;

const SENTIMENTS = new Set<EnrichResult["sentiment"]>([
  "release",
  "research",
  "opinion",
  "rumor",
  "tutorial",
  "other",
]);

export async function enrichArticle(input: EnrichInput): Promise<EnrichResult | null> {
  if (!AI_ENABLED) return null;
  const model = AI_MODELS.fast;
  const userBlock = [
    `Source: ${input.sourceName}`,
    `URL: ${input.url}`,
    `Language: ${input.lang}`,
    `Title: ${input.title}`,
    input.summary ? `Snippet: ${input.summary.slice(0, 600)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const msg = await client().messages.create({
      model,
      max_tokens: 400,
      temperature: 0.2,
      system: systemBlock(SYSTEM_PROMPT),
      messages: [{ role: "user", content: userBlock }],
    });
    const parsed = parseJson<Partial<EnrichResult> & {
      summary_en?: string;
      summary_zh?: string;
    }>(textOf(msg));
    const sentiment = SENTIMENTS.has(parsed.sentiment as EnrichResult["sentiment"])
      ? (parsed.sentiment as EnrichResult["sentiment"])
      : "other";
    const importance = clamp(Number(parsed.importance ?? 0), 0, 1);
    const topics = Array.isArray(parsed.topics)
      ? parsed.topics.filter((t) => typeof t === "string").slice(0, 5).map((s) => s.toLowerCase().trim())
      : [];
    return {
      summaryEn: String(parsed.summary_en ?? "").trim(),
      summaryZh: String(parsed.summary_zh ?? "").trim(),
      topics,
      sentiment,
      importance,
      model,
    };
  } catch (err) {
    console.warn(`  [ai] enrich failed for "${input.title.slice(0, 60)}":`, (err as Error).message);
    return null;
  }
}

function clamp(n: number, lo: number, hi: number) {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}
