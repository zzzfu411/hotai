import { request } from "undici";
import { config } from "./config.js";

export async function httpGet(url: string, init: { headers?: Record<string, string> } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.fetchTimeoutMs);
  try {
    const res = await request(url, {
      method: "GET",
      headers: {
        "user-agent": config.userAgent,
        accept: "*/*",
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
      maxRedirections: 5,
    });
    if (res.statusCode >= 400) {
      throw new Error(`HTTP ${res.statusCode} for ${url}`);
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export async function httpText(url: string, init: { headers?: Record<string, string> } = {}) {
  const res = await httpGet(url, init);
  return res.body.text();
}

export async function httpJson<T = unknown>(
  url: string,
  init: { headers?: Record<string, string> } = {},
): Promise<T> {
  const res = await httpGet(url, init);
  return (await res.body.json()) as T;
}
