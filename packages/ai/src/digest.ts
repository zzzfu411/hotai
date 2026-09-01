import { AI_MODELS, AI_ENABLED, createMessage, systemBlock, textOf } from "./client.js";
import { parseJson } from "./json.js";

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

function safeHttpUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if ((u.protocol !== "http:" && u.protocol !== "https:") || u.username || u.password || !u.hostname) {
      return null;
    }
    return u.toString();
  } catch {
    return null;
  }
}

const SYSTEM_PROMPT = `You are the editor-in-chief of an AI news digest. Given today's top
articles (already pre-ranked by heat score), write a concise daily brief.

Output STRICT JSON (no markdown):

{
  "headline": string,        // <=80 chars, the single most newsworthy thread of the day
  "overview": string,        // 2-3 short sentences, <=360 chars; cover the 2-3 biggest stories
  "themes": string[],        // 2-4 themes, lowercase short tags (e.g. "open-source models", "agentic ai", "regulation")
  "bullets": [               // EXACTLY 4 entries, ordered by importance — NOT just the input order
    {
      "title": string,       // <=70 chars, what happened
      "takeaway": string,    // <=120 chars, why it matters in one sentence
      "urls": string[]       // 1-2 of the most relevant source URLs from the input
    }
  ]
}

Rules:
- Cluster duplicates: if multiple articles cover the same story, fold them into one bullet with multiple urls.
- Skip filler and return exactly 4 strong bullets.
- Never invent URLs; use only those present in the input.
- Return minified JSON on one line and keep the entire response under 1800 characters.`;

export async function generateDigest(
  articles: DigestArticleInput[],
  opts: { model?: typeof AI_MODELS[keyof typeof AI_MODELS] } = {},
): Promise<DigestResult | null> {
  if (!AI_ENABLED) return null;
  if (articles.length === 0) return null;
  const model = opts.model ?? AI_MODELS.smart;

  const inputArticles = articles.slice(0, 40);
  const allowedUrls = new Set(inputArticles.map((a) => safeHttpUrl(a.url)).filter((u): u is string => Boolean(u)));
  const list = inputArticles
    .map(
      (a, i) =>
        `${i + 1}. [${a.sourceName}] ${a.title}\n   url: ${safeHttpUrl(a.url) ?? "[omitted: unsafe URL]"}\n   score: ${a.score.toFixed(1)}${
          a.topics?.length ? `\n   topics: ${a.topics.join(", ")}` : ""
        }${a.summaryEn ? `\n   summary: ${a.summaryEn}` : ""}`,
    )
    .join("\n\n");

  try {
    const msg = await createMessage({
      model,
      // Reasoning-capable relays may spend part of the output budget before
      // emitting the JSON. Keep enough headroom to avoid truncated digests.
      max_tokens: 3000,
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
    const headline = String(parsed.headline ?? "").trim().slice(0, 160);
    const overview = String(parsed.overview ?? "").trim().slice(0, 720);
    const themes = Array.isArray(parsed.themes)
      ? parsed.themes
          .filter((t): t is string => typeof t === "string")
          .map((t) => t.trim().slice(0, 80))
          .filter(Boolean)
          .slice(0, 4)
      : [];
    const bullets = Array.isArray(parsed.bullets)
      ? parsed.bullets
          .filter((b): b is DigestBullet => !!b && typeof b === "object" && typeof b.title === "string")
          .slice(0, 4)
          .map((b) => ({
            title: String(b.title).trim().slice(0, 160),
            takeaway: String(b.takeaway ?? "").trim().slice(0, 360),
            urls: Array.isArray(b.urls)
              ? b.urls
                  .filter((u): u is string => typeof u === "string")
                  .map((u) => safeHttpUrl(u))
                  .filter((u): u is string => u !== null)
                  .filter((u) => allowedUrls.has(u))
                  .slice(0, 2)
              : [],
          }))
          .filter((b) => b.title.length > 0 && b.takeaway.length > 0 && b.urls.length > 0)
      : [];

    // The prompt promises a complete four-item digest. Reject malformed or
    // provenance-free model output rather than persisting a partial digest
    // that looks authoritative to readers.
    if (!headline || !overview || bullets.length !== 4) {
      console.warn("[ai] digest response failed shape/provenance validation");
      return null;
    }
    return {
      headline,
      overview,
      themes,
      bullets,
      model,
    };
  } catch (err) {
    console.warn(`[ai] digest failed:`, (err as Error).message);
    return null;
  }
}
