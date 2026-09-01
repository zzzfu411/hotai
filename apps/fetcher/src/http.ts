import { config } from "./config.js";

type RequestResult = { response: Response; finalUrl: string; clear: () => void };

async function requestWithTimeout(url: string, init: { headers?: Record<string, string> } = {}): Promise<RequestResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.fetchTimeoutMs);
  try {
    let current = new URL(url);
    for (let redirects = 0; redirects <= 5; redirects++) {
      if (current.protocol !== "http:" && current.protocol !== "https:") {
        throw new Error(`unsupported URL protocol for ${current.href}`);
      }
      const response = await fetch(current, {
        method: "GET",
        headers: {
          "user-agent": config.userAgent,
          accept: "*/*",
          ...(init.headers ?? {}),
        },
        signal: controller.signal,
        redirect: "manual",
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirects === 5) {
          await response.body?.cancel();
          throw new Error(`too many or invalid redirects for ${url}`);
        }
        current = new URL(location, current);
        await response.body?.cancel();
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`HTTP ${response.status} for ${url}`);
      }
      return { response, finalUrl: current.toString(), clear: () => clearTimeout(timer) };
    }
    throw new Error(`too many redirects for ${url}`);
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error).name === "AbortError") throw new Error(`fetch timeout for ${url}`);
    throw err;
  }
}

async function readBody(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      const chunk = next.value;
      total += chunk.byteLength;
      if (total > config.fetchMaxBytes) {
        await reader.cancel();
        throw new Error(`response body exceeds ${config.fetchMaxBytes} bytes`);
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

export async function httpText(url: string, init: { headers?: Record<string, string> } = {}) {
  const req = await requestWithTimeout(url, init);
  try {
    return await readBody(req.response);
  } finally {
    req.clear();
  }
}

export async function httpJson<T = unknown>(
  url: string,
  init: { headers?: Record<string, string> } = {},
): Promise<T> {
  const text = await httpText(url, init);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`invalid JSON response for ${url}`);
  }
}
