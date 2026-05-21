import Anthropic from "@anthropic-ai/sdk";

/**
 * Model IDs come from env vars so the same code can drive Anthropic direct, a
 * Claude-flavoured relay, or any /v1/messages-compatible proxy with different
 * downstream models. Defaults assume Anthropic-direct.
 */
export const AI_MODELS = {
  fast: process.env.LLM_MODEL_FAST || "claude-haiku-4-5",
  smart: process.env.LLM_MODEL_SMART || "claude-sonnet-4-6",
} as const;

export type AIModel = string;

export const AI_ENABLED = Boolean(process.env.ANTHROPIC_API_KEY);

/**
 * Many relays (one-api / new-api / oneapi-style proxies) don't implement
 * Anthropic's prompt-cache controls and will 400 if `cache_control` is present.
 * Defaults to true (direct Anthropic); set AI_PROMPT_CACHE=false to strip it.
 */
export const AI_PROMPT_CACHE =
  (process.env.AI_PROMPT_CACHE ?? "true").toLowerCase() !== "false";

let _client: Anthropic | null = null;

export function client(): Anthropic {
  if (!AI_ENABLED) {
    throw new Error("ANTHROPIC_API_KEY not set — AI features are disabled");
  }
  if (!_client) {
    _client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      // Point at a relay that speaks /v1/messages. e.g. "https://api.your-relay.com"
      baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
    });
  }
  return _client;
}

/**
 * Build a system-prompt block. When prompt caching is enabled we tag the block
 * as ephemeral so Anthropic's cache absorbs the bulk of tokens across a batch.
 * On a relay that rejects cache_control, set AI_PROMPT_CACHE=false.
 */
export function systemBlock(text: string): Anthropic.Messages.TextBlockParam[] {
  const block: Anthropic.Messages.TextBlockParam = { type: "text", text };
  if (AI_PROMPT_CACHE) {
    (block as Anthropic.Messages.TextBlockParam & {
      cache_control?: { type: "ephemeral" };
    }).cache_control = { type: "ephemeral" };
  }
  return [block];
}

/** Extract concatenated text from a non-streaming message response. */
export function textOf(msg: Anthropic.Messages.Message): string {
  return msg.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** Best-effort JSON extraction — tolerates ``` fences and stray prose. */
export function parseJson<T = unknown>(raw: string): T {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const body = fenced ? fenced[1]! : trimmed;
  const start = Math.min(
    ...["{", "["]
      .map((c) => body.indexOf(c))
      .filter((i) => i >= 0),
  );
  const slice = Number.isFinite(start) ? body.slice(start) : body;
  return JSON.parse(slice) as T;
}
