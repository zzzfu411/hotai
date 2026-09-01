import { describe, expect, it } from "vitest";
import { linkDigestBullets } from "./digest-links";

describe("linkDigestBullets", () => {
  it("adds in-site article links to URL-only legacy bullets", () => {
    const [linked] = linkDigestBullets(
      [{ title: "Story", takeaway: "Why it matters", urls: ["https://example.com/story"] }],
      [{ id: 42, url: "https://example.com/story" }],
    );
    expect(linked?.articleIds).toEqual([42]);
  });

  it("keeps derived IDs bounded and deduplicated", () => {
    const [linked] = linkDigestBullets(
      [{
        title: "Story",
        takeaway: "Why it matters",
        urls: ["https://example.com/a"],
        articleIds: [1, 1, 2, 3, 4, 5, -1],
      }],
      [{ id: 9, url: "https://example.com/a" }],
    );
    expect(linked?.articleIds).toEqual([1, 2, 3, 4]);
  });
});
