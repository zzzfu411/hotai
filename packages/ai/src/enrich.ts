import { AI_MODELS, createMessage, systemBlock, textOf, AI_ENABLED } from "./client.js";
import { parseJson } from "./json.js";

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
 * Shared field spec — single and batch prompts must stay in lockstep so a
 * batch fallback to single calls produces identical data.
 */
const SCHEMA_SPEC = `{
  "summary_en": string,   // one tight sentence, <=200 chars, plain English, no hype, no leading "This article"
  "summary_zh": string,   // 一句话中文摘要,<=80 个字,客观,不要"本文"开头
  "topics": string[],     // 3-5 lowercase short tags (e.g. "llm", "open-source", "alignment", "vision", "agents")
  "sentiment": "release" | "research" | "opinion" | "rumor" | "tutorial" | "other",
  "importance": number    // 0.0-1.0; reserve >0.8 for major lab/product launches or landmark papers
}`;

const SHARED_RULES = `Rules:
- If the title is non-English, still produce both summary_en (translate) and summary_zh.
- If the input is too thin to be confident, set importance <= 0.3 and keep summary concise.
- Never invent facts not implied by the title/summary. Prefer "details not yet available" over hallucination.`;

const SINGLE_SYSTEM_PROMPT = `You are an editor for an AI-news aggregator. For each article you receive,
output STRICT JSON (no markdown, no commentary) with the schema:

${SCHEMA_SPEC}

${SHARED_RULES}`;

const BATCH_SYSTEM_PROMPT = `You are an editor for an AI-news aggregator. You will receive several
numbered articles. Output a STRICT JSON array (no markdown, no commentary) with EXACTLY one object
per article, in the same order as the input. Each object follows the schema:

${SCHEMA_SPEC}

${SHARED_RULES}
- The output array length MUST equal the number of input articles. Never merge or drop entries.`;

const SENTIMENTS = new Set<EnrichResult["sentiment"]>([
  "release",
  "research",
  "opinion",
  "rumor",
  "tutorial",
  "other",
]);

function formatInput(input: EnrichInput): string {
  const url = safeHttpUrl(input.url);
  return [
    `Source: ${input.sourceName}`,
    url ? `URL: ${url}` : null,
    `Language: ${input.lang}`,
    `Title: ${input.title}`,
    input.summary ? `Snippet: ${input.summary.slice(0, 600)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Coerce one raw model entry into an EnrichResult; null when it isn't usable. */
function normalizeResult(parsed: unknown, model: string): EnrichResult | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const p = parsed as Record<string, unknown>;
  if (!SENTIMENTS.has(p.sentiment as EnrichResult["sentiment"])) return null;
  const sentiment = p.sentiment as EnrichResult["sentiment"];
  const topics = Array.isArray(p.topics)
    ? [...new Set(p.topics
        .filter((t): t is string => typeof t === "string")
        .map((s) => s.toLowerCase().trim())
        .filter(Boolean))]
        .slice(0, 5)
    : [];
  const summaryEn = typeof p.summary_en === "string" ? p.summary_en.trim().slice(0, 400) : "";
  const summaryZh = typeof p.summary_zh === "string" ? p.summary_zh.trim().slice(0, 200) : "";
  const importance = Number(p.importance);
  if (!summaryEn || !summaryZh || topics.length === 0 || !Number.isFinite(importance) || importance < 0 || importance > 1) {
    return null;
  }
  return {
    summaryEn,
    summaryZh,
    topics,
    sentiment,
    importance,
    model,
  };
}

function safeHttpUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw.trim());
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.username || parsed.password || !parsed.hostname) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

/** Enrich a single article. Fail-soft: returns null on any error. */
export async function enrichArticle(input: EnrichInput): Promise<EnrichResult | null> {
  if (!AI_ENABLED) return null;
  const model = AI_MODELS.fast;
  try {
    const msg = await createMessage({
      model,
      max_tokens: 400,
      temperature: 0.2,
      system: systemBlock(SINGLE_SYSTEM_PROMPT),
      messages: [{ role: "user", content: formatInput(input) }],
    });
    return normalizeResult(parseJson(textOf(msg)), model);
  } catch (err) {
    console.warn(`  [ai] enrich failed for "${input.title.slice(0, 60)}":`, (err as Error).message);
    return null;
  }
}

/**
 * Enrich a batch of articles in ONE API call (cuts per-call protocol overhead
 * by ~an order of magnitude vs. article-per-call).
 *
 * Returns an array aligned index-for-index with `inputs`; individual entries
 * are null when that article's data was unusable. Returns null when the batch
 * as a whole failed (transport error, non-array output, length mismatch) —
 * callers should fall back to per-article `enrichArticle`.
 */
export async function enrichArticles(
  inputs: EnrichInput[],
): Promise<(EnrichResult | null)[] | null> {
  if (!AI_ENABLED) return null;
  if (inputs.length === 0) return [];
  if (inputs.length === 1) return [await enrichArticle(inputs[0]!)];

  const model = AI_MODELS.fast;
  const body = inputs
    .map((input, i) => `[${i + 1}]\n${formatInput(input)}`)
    .join("\n\n");
  try {
    const msg = await createMessage({
      model,
      max_tokens: Math.min(400 * inputs.length, 8000),
      temperature: 0.2,
      system: systemBlock(BATCH_SYSTEM_PROMPT),
      messages: [
        {
          role: "user",
          content: `${inputs.length} articles:\n\n${body}\n\nOutput the JSON array with ${inputs.length} objects now.`,
        },
      ],
    });
    const parsed = parseJson<unknown>(textOf(msg));
    if (!Array.isArray(parsed) || parsed.length !== inputs.length) {
      console.warn(
        `  [ai] batch enrich shape mismatch — expected ${inputs.length} entries, got ${
          Array.isArray(parsed) ? parsed.length : typeof parsed
        }`,
      );
      return null;
    }
    return parsed.map((entry) => normalizeResult(entry, model));
  } catch (err) {
    console.warn(`  [ai] batch enrich (${inputs.length} articles) failed:`, (err as Error).message);
    return null;
  }
}
