import { AI_MODELS, AI_ENABLED, client, parseJson, systemBlock, textOf } from "./client.js";

export type DigestArticleInput = {
  id: number;
  title: string;
  summaryEn?: string | null;
  url: string;
  sourceName: string;
  score: number;
  topics?: string[];
};

export type DigestBullet = {
  title: string;
  takeaway: string;
  urls: string[];
};

export type DigestResult = {
  headline: string;
  overview: string;
  bullets: DigestBullet[];
  themes: string[];
  model: string;
};

const SYSTEM_PROMPT = `You are the editor-in-chief of an AI news digest. Given today's top
articles (already pre-ranked by heat score), write a concise daily brief.

Output STRICT JSON (no markdown):

{
  "headline": string,        // <=80 chars, the single most newsworthy thread of the day
  "overview": string,        // 3-5 sentences, plain prose, scannable; cover the 2-3 biggest stories
  "themes": string[],        // 2-5 themes, lowercase short tags (e.g. "open-source models", "agentic ai", "regulation")
  "bullets": [               // 4-6 entries, ordered by importance — NOT just the input order
    {
      "title": string,       // <=80 chars, what happened
      "takeaway": string,    // <=180 chars, why it matters in one sentence
      "urls": string[]       // 1-3 of the most relevant source URLs from the input
    }
  ]
}

Rules:
- Cluster duplicates: if multiple articles cover the same story, fold them into one bullet with multiple urls.
- Skip filler. Prefer 4 strong bullets over 6 weak ones.
- Never invent URLs; use only those present in the input.`;

export async function generateDigest(
  articles: DigestArticleInput[],
  opts: { model?: typeof AI_MODELS[keyof typeof AI_MODELS] } = {},
): Promise<DigestResult | null> {
  if (!AI_ENABLED) return null;
  if (articles.length === 0) return null;
  const model = opts.model ?? AI_MODELS.smart;

  const list = articles
    .slice(0, 40)
    .map(
      (a, i) =>
        `${i + 1}. [${a.sourceName}] ${a.title}\n   url: ${a.url}\n   score: ${a.score.toFixed(1)}${
          a.topics?.length ? `\n   topics: ${a.topics.join(", ")}` : ""
        }${a.summaryEn ? `\n   summary: ${a.summaryEn}` : ""}`,
    )
    .join("\n\n");

  try {
    const msg = await client().messages.create({
      model,
      max_tokens: 1200,
      temperature: 0.3,
      system: systemBlock(SYSTEM_PROMPT),
      messages: [
        {
          role: "user",
          content: `Today's articles (newest top of feed):\n\n${list}`,
        },
      ],
    });
    const parsed = parseJson<Partial<DigestResult>>(textOf(msg));
    return {
      headline: String(parsed.headline ?? "").trim(),
      overview: String(parsed.overview ?? "").trim(),
      themes: Array.isArray(parsed.themes)
        ? parsed.themes.filter((t) => typeof t === "string").slice(0, 6)
        : [],
      bullets: Array.isArray(parsed.bullets)
        ? parsed.bullets
            .filter((b): b is DigestBullet => !!b && typeof b.title === "string")
            .slice(0, 6)
            .map((b) => ({
              title: String(b.title).trim(),
              takeaway: String(b.takeaway ?? "").trim(),
              urls: Array.isArray(b.urls) ? b.urls.filter((u) => typeof u === "string").slice(0, 3) : [],
            }))
        : [],
      model,
    };
  } catch (err) {
    console.warn(`[ai] digest failed:`, (err as Error).message);
    return null;
  }
}
