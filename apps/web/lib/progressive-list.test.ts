import { describe, expect, it } from "vitest";
import { preserveVisiblePrefix } from "./progressive-list";

describe("preserveVisiblePrefix", () => {
  it("keeps visible cards stable and sorts the unseen tail with fresh data", () => {
    const previous = [
      { id: "a", value: "old a" },
      { id: "b", value: "old b" },
      { id: "c", value: "old c" },
      { id: "d", value: "old d" },
    ];
    const next = [
      { id: "e", value: "new e" },
      { id: "c", value: "new c" },
      { id: "a", value: "new a" },
      { id: "d", value: "new d" },
      { id: "b", value: "new b" },
    ];

    expect(preserveVisiblePrefix(previous, next, 2, (item) => item.id)).toEqual([
      { id: "a", value: "new a" },
      { id: "b", value: "new b" },
      { id: "e", value: "new e" },
      { id: "c", value: "new c" },
      { id: "d", value: "new d" },
    ]);
  });

  it("drops removed visible cards instead of retaining stale data", () => {
    const previous = [{ id: "gone" }, { id: "kept" }];
    const next = [{ id: "new" }, { id: "kept" }];

    expect(preserveVisiblePrefix(previous, next, 2, (item) => item.id)).toEqual([
      { id: "kept" },
      { id: "new" },
    ]);
  });
});
