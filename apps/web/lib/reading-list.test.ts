import { describe, expect, it } from "vitest";
import { parseReadingEntries, storyState } from "./reading-list";
import { readerLink } from "./reader-link";

describe("shared reading identities", () => {
  it("routes a trusted internal item directly, and keeps remote URLs inside the reader", () => {
    expect(readerLink({ articleId: 12, url: "https://example.com/story", title: "Story" })).toBe("/a/12");
    expect(readerLink({ url: "https://example.com/story", title: "Story" })).toContain("/r?url=");
    expect(readerLink({ url: "javascript:alert(1)", title: "Story" })).toBe("/subscribe");
  });
  it("rejects corrupt snapshots while preserving a legacy ID and a remote original", () => {
    const entries = parseReadingEntries(JSON.stringify([
      { articleId: 12, state: "later" }, { url: "javascript:bad", state: "later" },
      { url: "https://example.com/story", title: "Story", state: "read" },
    ]));
    expect(entries).toHaveLength(2);
    expect(storyState(entries, { articleId: 12, url: "https://other.test/story", title: "Legacy" })).toBe("later");
    expect(storyState(entries, { url: "https://example.com/story", title: "Story" })).toBe("read");
  });
});
