import { describe, expect, it, vi } from "vitest";
import { prepareItems } from "./store.js";
import type { RawItem } from "./types.js";

describe("prepareItems", () => {
  it("bounds fields and explains discarded adapter output", () => {
    vi.useFakeTimers();
    try {
      const now = new Date("2026-09-01T12:00:00.000Z");
      vi.setSystemTime(now);
      const valid: RawItem = {
        url: "https://example.com/story",
        title: "T".repeat(1_000),
        summary: "S".repeat(1_000),
        author: "A".repeat(500),
        tags: ["T".repeat(500)],
        publishedAt: new Date("2026-09-01T11:00:00.000Z"),
        raw: { payload: "x".repeat(20_000) },
      };
      const batch = prepareItems([
        valid,
        { ...valid, title: "duplicate" },
        { ...valid, url: "not-a-url", title: "bad url" },
        { ...valid, url: "https://example.com/old", publishedAt: new Date("2020-01-01T00:00:00.000Z") },
        { ...valid, url: "https://example.com/no-title", title: "" },
      ]);

      expect(batch.items).toHaveLength(1);
      expect(batch.items[0]?.title).toHaveLength(300);
      expect(batch.items[0]?.summary).toHaveLength(600);
      expect(batch.items[0]?.author).toHaveLength(200);
      expect(batch.items[0]?.tags[0]).toHaveLength(80);
      expect(batch.items[0]?.raw).toBeUndefined();
      expect(batch.discardedDuplicate).toBe(1);
      expect(batch.discardedOutsideWindow).toBe(1);
      expect(batch.discardedInvalid).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
