/**
 * Bound and escape external text before interpolating it into a structured
 * prompt. Escaping delimiter characters matters: an untrusted title that
 * contains `</article_data>` must remain data, not become new prompt syntax.
 */
export function promptText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  const limit = Number.isFinite(maxLength) ? Math.max(0, Math.trunc(maxLength)) : 0;
  if (limit === 0) return "";
  const trimmed = value.trim();
  const clipped = trimmed.length > limit;
  const bounded = clipped ? trimmed.slice(0, Math.max(0, limit - 1)) : trimmed;
  let encoded = "";
  for (const character of bounded) {
    const safe = character === "&" ? "&amp;" : character === "<" ? "&lt;" : character === ">" ? "&gt;" : character;
    if (encoded.length + safe.length > limit) break;
    encoded += safe;
  }
  if (clipped && encoded.length < limit) encoded += "…";
  return encoded.slice(0, limit);
}
