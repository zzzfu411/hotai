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

const anthropicAuthToken = process.env.ANTHROPIC_AUTH_TOKEN;
const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

export const AI_ENABLED = Boolean(anthropicAuthToken || anthropicApiKey);

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
    throw new Error(
      "ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY not set — AI features are disabled",
    );
  }
  if (!_client) {
    _client = new Anthropic({
      // Bearer-only relays use ANTHROPIC_AUTH_TOKEN; direct Anthropic uses
      // ANTHROPIC_API_KEY. Prefer the token when both are present.
      authToken: anthropicAuthToken || null,
      apiKey: anthropicAuthToken ? null : anthropicApiKey,
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

/**
 * Non-streaming completion with `stream: false` set EXPLICITLY on the wire.
 * Some relays (protocol translators, e.g. Anthropic→xAI bridges) default to
 * streaming when the field is omitted, which breaks the SDK's JSON parsing.
 * Anthropic-direct treats the explicit false as a no-op, so this is safe
 * everywhere. All non-streaming calls in this package must go through here.
 */
export function createMessage(
  params: Omit<Anthropic.Messages.MessageCreateParamsNonStreaming, "stream">,
): Promise<Anthropic.Messages.Message> {
  return client().messages.create({ ...params, stream: false });
}

/** Extract concatenated text from a non-streaming message response. */
export function textOf(msg: Anthropic.Messages.Message): string {
  return msg.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}
