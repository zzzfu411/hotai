/**
 * Defensive JSON extraction from LLM output.
 *
 * Models occasionally wrap JSON in ``` fences, prepend "Here is the JSON:",
 * or append commentary after the closing bracket; some relays add their own
 * framing. Strategy, in order:
 *   1. parse the raw text as-is
 *   2. parse each ``` fenced block
 *   3. scan for the first balanced {...} or [...] (string-aware) and parse that
 */
export function parseJson<T = unknown>(raw: string): T {
  const trimmed = raw.trim();
  const candidates: string[] = [trimmed];
  for (const m of trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)) {
    const body = m[1]?.trim();
    if (body) candidates.push(body);
  }
  const scanned = extractFirstJson(trimmed);
  if (scanned) candidates.push(scanned);

  let lastErr: unknown = new Error("empty model output");
  for (const c of candidates) {
    try {
      return JSON.parse(c) as T;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("no parsable JSON in model output");
}

/**
 * Return the first balanced JSON object or array embedded in `text`, or null.
 * Tracks string/escape state so brackets inside string values don't miscount.
 */
export function extractFirstJson(text: string): string | null {
  const iObj = text.indexOf("{");
  const iArr = text.indexOf("[");
  if (iObj < 0 && iArr < 0) return null;
  const start = iObj < 0 ? iArr : iArr < 0 ? iObj : Math.min(iObj, iArr);
  const open = text[start] as "{" | "[";
  const close = open === "{" ? "}" : "]";

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === open) {
      depth++;
    } else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}
