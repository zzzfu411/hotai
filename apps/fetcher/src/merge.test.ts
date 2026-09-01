import { describe, expect, it } from "vitest";
import { appendCrossPost, asSignals, mergeSignals, type CrossPost } from "./merge.js";

describe("asSignals", () => {
  it("validates a Json column value into Signals", () => {
    expect(asSignals({ points: 12, stars: "3", junk: "x" })).toEqual({ points: 12, stars: 3 });
  });

  it("rejects non-objects, arrays and all-invalid payloads", () => {
    expect(asSignals(null)).toBeUndefined();
    expect(asSignals("points")).toBeUndefined();
    expect(asSignals([1, 2])).toBeUndefined();
    expect(asSignals({ points: -5, stars: "many" })).toBeUndefined();
  });
});

describe("mergeSignals", () => {
  it("keeps the max per key", () => {
    expect(mergeSignals({ points: 10, comments: 4 }, { points: 25, stars: 3 })).toEqual({
      points: 25,
      comments: 4,
      stars: 3,
    });
  });

  it("handles missing sides", () => {
    expect(mergeSignals(undefined, { points: 10 })).toEqual({ points: 10 });
    expect(mergeSignals({ points: 10 }, null)).toEqual({ points: 10 });
    expect(mergeSignals(undefined, undefined)).toBeUndefined();
  });
});

describe("appendCrossPost", () => {
  const entry: CrossPost = {
    source: "qbitai",
    url: "https://qbitai.com/x",
    publishedAt: "2026-07-12T00:00:00.000Z",
  };

  it("appends to an empty/garbage existing value", () => {
    expect(appendCrossPost(null, entry)).toEqual([entry]);
    expect(appendCrossPost("nonsense", entry)).toEqual([entry]);
    expect(appendCrossPost([{ broken: true }], entry)).toEqual([entry]);
  });

  it("dedupes by url", () => {
    const once = appendCrossPost(null, entry);
    expect(appendCrossPost(once, { ...entry, publishedAt: "2026-07-13T00:00:00.000Z" })).toHaveLength(1);
  });

  it("drops legacy unsafe URLs before preserving cross-post metadata", () => {
    const list = appendCrossPost(
      [{ source: "bad", url: "javascript:alert(1)", publishedAt: "" }],
      entry,
    );
    expect(list).toEqual([entry]);
  });

  it("caps the list", () => {
    let list: unknown = null;
    for (let i = 0; i < 15; i++) {
      list = appendCrossPost(list, { source: `s${i}`, url: `https://x.com/${i}`, publishedAt: "" });
    }
    expect(list).toHaveLength(10);
  });
});
