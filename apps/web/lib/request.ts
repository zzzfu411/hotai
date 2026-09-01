/** Read a JSON request body with an explicit byte ceiling. */
export async function readJsonBody<T>(
  req: Request,
  maxBytes: number,
): Promise<{ ok: true; value: T } | { ok: false; status: 400 | 413; error: string }> {
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, status: 413, error: "request body too large" };
  }
  const body = req.body;
  if (!body) return { ok: false, status: 400, error: "invalid request body" };

  // Do not call Request.text() here: it buffers an unbounded chunked body
  // before the size check can run. Read the stream incrementally and cancel
  // as soon as the byte ceiling is crossed.
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { ok: false, status: 413, error: "request body too large" };
      }
      text += decoder.decode(next.value, { stream: true });
    }
    text += decoder.decode();
  } catch {
    return { ok: false, status: 400, error: "invalid request body" };
  } finally {
    reader.releaseLock();
  }
  try {
    return { ok: true, value: JSON.parse(text) as T };
  } catch {
    return { ok: false, status: 400, error: "invalid JSON" };
  }
}

/** Reject JSON scalars/arrays before route handlers read named fields. */
export function asJsonRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
