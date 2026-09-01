import {
  collectHealthSnapshotCached,
  formatPrometheus,
  isObservabilityAuthorized,
} from "@/lib/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEXT_HEADERS = {
  "cache-control": "no-store",
  "content-type": "text/plain; version=0.0.4; charset=utf-8",
};

/** Prometheus endpoint; disabled until OBSERVABILITY_TOKEN is configured. */
export async function GET(request: Request) {
  const configured = process.env.OBSERVABILITY_TOKEN?.trim() ?? "";
  if (!configured) return new Response("not found\n", { status: 404, headers: TEXT_HEADERS });
  if (!isObservabilityAuthorized(request, configured)) {
    return new Response("unauthorized\n", {
      status: 401,
      headers: { ...TEXT_HEADERS, "www-authenticate": 'Bearer realm="hotai-metrics"' },
    });
  }

  try {
    const snapshot = await collectHealthSnapshotCached();
    return new Response(formatPrometheus(snapshot), { status: 200, headers: TEXT_HEADERS });
  } catch (error) {
    console.error(
      "[metrics] snapshot unavailable:",
      error instanceof Error ? error.message.slice(0, 300) : "unknown database error",
    );
    return new Response("hotai_up 0\nhotai_ready 0\n", {
      status: 503,
      headers: { ...TEXT_HEADERS, "retry-after": "5" },
    });
  }
}
