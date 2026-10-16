import type { PullSource } from "./nook-merge";

/**
 * Browser side of the /api/catalog/pull NDJSON stream: a `{ source }` line per
 * finished feed, then `{ done: true }`, which carries `degraded: "service"`
 * when the server answered from snapshots. Other lines are progress only.
 */

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** The feed result in a stream line, or null when the line is something else. */
export function catalogSourceEvent(value: unknown): PullSource | null {
  const source = record(record(value)?.source);
  if (
    !source ||
    typeof source.id !== "string" ||
    typeof source.name !== "string" ||
    typeof source.ok !== "boolean"
  ) {
    return null;
  }
  return {
    id: source.id,
    name: source.name,
    ok: source.ok,
    items: source.items,
    error: typeof source.error === "string" ? source.error : undefined,
    stale: source.stale === true,
    fetchedAt: typeof source.fetchedAt === "string" ? source.fetchedAt : undefined,
  };
}

/** The closing line, or null; a stream without one ended early. */
export function catalogDoneEvent(value: unknown): { serviceDegraded: boolean } | null {
  const line = record(value);
  return line?.done === true ? { serviceDegraded: line.degraded === "service" } : null;
}
