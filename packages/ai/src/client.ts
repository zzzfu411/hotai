import Anthropic from "@anthropic-ai/sdk";

/**
 * Model IDs come from env vars so the same code can drive Anthropic direct or
 * an explicitly approved /v1/messages-compatible relay. Defaults assume the
 * official Anthropic endpoint.
 */
export const AI_MODELS = {
  fast: process.env.LLM_MODEL_FAST?.trim() || "claude-haiku-4-5",
  smart: process.env.LLM_MODEL_SMART?.trim() || "claude-sonnet-4-6",
} as const;

export type AIModel = string;

const OFFICIAL_HOST = "api.anthropic.com";
const PLACEHOLDER_RE = /^(?:<[^>]+>|your(?:[-_].*)?|changeme|change[-_ ]?me|example(?:[-_].*)?|replace(?:[-_ ].*)?)$/i;

export type AIConfig = {
  authToken: string;
  apiKey: string;
  baseURL: string;
  enabled: boolean;
  error: string | null;
};

function clean(value: string | undefined): string {
  const v = value?.trim() ?? "";
  return !v || PLACEHOLDER_RE.test(v) ? "" : v;
}

/**
 * Resolve AI settings without silently routing credentials or content to a
 * third party. This is exported so configuration tests can exercise the
 * fail-closed rules without mutating process.env.
 */
export function readAIConfig(env: Record<string, string | undefined> = process.env): AIConfig {
  const authToken = clean(env.ANTHROPIC_AUTH_TOKEN);
  const apiKey = clean(env.ANTHROPIC_API_KEY);
  const rawBase = clean(env.ANTHROPIC_BASE_URL);
  const allowThirdParty = (env.ALLOW_THIRD_PARTY_AI ?? "").trim().toLowerCase() === "true";
  const allowInsecureHttp = (env.ALLOW_INSECURE_AI_HTTP ?? "").trim().toLowerCase() === "true";

  if (authToken && apiKey) {
    return { authToken, apiKey, baseURL: "", enabled: false, error: "set only one of ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY" };
  }

  let baseURL = "";
  if (rawBase) {
    try {
      const parsed = new URL(rawBase);
      if (parsed.username || parsed.password || (parsed.protocol !== "https:" && parsed.protocol !== "http:")) {
        return { authToken, apiKey, baseURL: "", enabled: false, error: "ANTHROPIC_BASE_URL must be an http(s) URL without credentials" };
      }
      if (parsed.protocol === "http:" && !allowInsecureHttp && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
        return { authToken, apiKey, baseURL: "", enabled: false, error: "HTTP AI endpoints require ALLOW_INSECURE_AI_HTTP=true" };
      }
      if (parsed.hostname.toLowerCase() !== OFFICIAL_HOST && !allowThirdParty) {
        return { authToken, apiKey, baseURL: "", enabled: false, error: "non-official AI endpoints require ALLOW_THIRD_PARTY_AI=true" };
      }
      parsed.hash = "";
      baseURL = parsed.toString().replace(/\/$/, "");
    } catch {
      return { authToken, apiKey, baseURL: "", enabled: false, error: "ANTHROPIC_BASE_URL is invalid" };
    }
  }

  return { authToken, apiKey, baseURL, enabled: Boolean(authToken || apiKey), error: null };
}

export const AI_CONFIG = readAIConfig();
export const AI_ENABLED = AI_CONFIG.enabled && !AI_CONFIG.error;

/**
 * Many relays (one-api / new-api / oneapi-style proxies) don't implement
 * Anthropic's prompt-cache controls and will 400 if `cache_control` is present.
 * Defaults to true (direct Anthropic); set AI_PROMPT_CACHE=false to strip it.
 */
export const AI_PROMPT_CACHE =
  (process.env.AI_PROMPT_CACHE ?? "true").toLowerCase() !== "false";

/** Shared feature flag consumed by both the fetcher and the Web fallback. */
export const AI_DIGEST_ENABLED =
  !["false", "0", "no", "off"].includes((process.env.AI_DIGEST_ENABLED ?? "true").trim().toLowerCase());

let _client: Anthropic | null = null;

export function client(): Anthropic {
  if (AI_CONFIG.error) {
    throw new Error(`AI configuration rejected: ${AI_CONFIG.error}`);
  }
  if (!AI_ENABLED) {
    throw new Error(
      "ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY not set — AI features are disabled",
    );
  }
  if (!_client) {
    _client = new Anthropic({
      // Bearer-only relays use ANTHROPIC_AUTH_TOKEN; direct Anthropic uses
      // ANTHROPIC_API_KEY. readAIConfig rejects ambiguous dual credentials.
      authToken: AI_CONFIG.authToken || null,
      apiKey: AI_CONFIG.authToken ? null : AI_CONFIG.apiKey || null,
      // Empty means the SDK's official Anthropic endpoint.
      baseURL: AI_CONFIG.baseURL || undefined,
      timeout: 90_000,
      maxRetries: 1,
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
