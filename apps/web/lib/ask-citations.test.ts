import { describe, expect, it } from "vitest";
import { buildAskCitationSources, sanitizeAskCitationSources } from "./ask-citations";

describe("Ask citations", () => {
  it("preserves corpus indices while rejecting unsafe links", () => {
    const sources = buildAskCitationSources([
      { id: 7, title: "First", url: "https://example.com/a", source: { name: "Lab" } },
      { id: 8, title: "Private", url: "http://127.0.0.1/admin", source: { name: "Bad" } },
      { id: 9, title: "Third", url: "https://example.com/c", source: { name: "Lab" } },
    ]);
    expect(sources.map((source) => source.index)).toEqual([1, 3]);
  });

  it("sanitizes cached citation JSON and deduplicates indices", () => {
    const sources = sanitizeAskCitationSources([
      { index: 2, id: 9, title: "Story", source: "Lab", url: "https://example.com/story" },
      { index: 2, id: 10, title: "Duplicate", source: "Lab", url: "https://example.com/other" },
      { index: 3, id: -1, title: "Bad", source: "Lab", url: "https://example.com/bad" },
    ]);
    expect(sources).toEqual([
      { index: 2, id: 9, title: "Story", source: "Lab", url: "https://example.com/story" },
    ]);
  });
});
