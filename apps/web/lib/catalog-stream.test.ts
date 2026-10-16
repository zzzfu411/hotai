import { describe, expect, it } from "vitest";
import { catalogDoneEvent, catalogSourceEvent } from "./catalog-stream";

describe("catalog stream lines", () => {
  it("reads a finished source and drops fields of the wrong type", () => {
    expect(
      catalogSourceEvent({
        source: { id: "hn", name: "Hacker News", ok: true, items: [], stale: "yes", error: 3, fetchedAt: "2026-10-16T00:00:00Z" },
        index: 0,
      }),
    ).toEqual({ id: "hn", name: "Hacker News", ok: true, items: [], stale: false, error: undefined, fetchedAt: "2026-10-16T00:00:00Z" });
  });

  it("ignores progress lines and malformed sources", () => {
    expect(catalogSourceEvent({ total: 12 })).toBeNull();
    expect(catalogSourceEvent({ source: { id: "hn", ok: true } })).toBeNull();
    expect(catalogSourceEvent([{ source: {} }])).toBeNull();
    expect(catalogDoneEvent({ total: 12 })).toBeNull();
  });

  it("reads the closing line and its service flag", () => {
    expect(catalogDoneEvent({ done: true, completed: 3, total: 3 })).toEqual({ serviceDegraded: false });
    expect(catalogDoneEvent({ done: true, degraded: "service" })).toEqual({ serviceDegraded: true });
    expect(catalogDoneEvent({ done: "true" })).toBeNull();
  });
});
