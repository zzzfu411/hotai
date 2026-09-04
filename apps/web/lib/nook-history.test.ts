import { describe, expect, it } from "vitest";
import {
  createNookHistorySnapshot,
  mergeNookHistoryState,
  readNookHistorySnapshot,
  visibleCountForAnchor,
} from "./nook-history";

const NOW = Date.parse("2026-09-04T12:00:00.000Z");

describe("Nook history snapshots", () => {
  it("preserves Next history fields and reads the matching view", () => {
    const snapshot = createNookHistorySnapshot(
      {
        viewKey: "mix:gnews-top,hn",
        shown: 72,
        scrollY: 4_321,
        anchorKey: "https://example.com/story",
        anchorOffset: 118,
      },
      NOW,
    );
    const state = mergeNookHistoryState(
      { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ["", {}] },
      snapshot,
    );

    expect(state.__NA).toBe(true);
    expect(state.__PRIVATE_NEXTJS_INTERNALS_TREE).toEqual(["", {}]);
    expect(readNookHistorySnapshot(state, "mix:gnews-top,hn", NOW + 1_000)).toEqual(snapshot);
  });

  it("rejects another view, stale data, future data, and malformed numbers", () => {
    const snapshot = createNookHistorySnapshot(
      { viewKey: "tech:hn", shown: 48, scrollY: 900 },
      NOW,
    );
    const state = mergeNookHistoryState(null, snapshot);

    expect(readNookHistorySnapshot(state, "mix:hn", NOW)).toBeNull();
    expect(readNookHistorySnapshot(state, "tech:hn", NOW + 12 * 60 * 60 * 1000 + 1)).toBeNull();
    expect(readNookHistorySnapshot(state, "tech:hn", NOW - 60_001)).toBeNull();
    expect(
      readNookHistorySnapshot(
        { ...state, __hotaiNookFeed: { ...snapshot, scrollY: Number.NaN } },
        "tech:hn",
        NOW,
      ),
    ).toBeNull();
  });

  it("bounds captured browser values", () => {
    const snapshot = createNookHistorySnapshot(
      {
        viewKey: "mix:test",
        shown: -4,
        scrollY: -20,
        anchorKey: "  ",
        anchorOffset: Number.POSITIVE_INFINITY,
      },
      NOW,
    );

    expect(snapshot.shown).toBe(24);
    expect(snapshot.scrollY).toBe(0);
    expect(snapshot.anchorKey).toBeNull();
    expect(snapshot.anchorOffset).toBe(0);
  });
});

describe("visibleCountForAnchor", () => {
  it("keeps the current depth or expands by complete pages", () => {
    expect(visibleCountForAnchor(72, 30, 140)).toBe(72);
    expect(visibleCountForAnchor(24, 72, 140)).toBe(96);
    expect(visibleCountForAnchor(24, 130, 132)).toBe(132);
  });
});
