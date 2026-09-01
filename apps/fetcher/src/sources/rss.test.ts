import { describe, expect, it } from "vitest";
import { selectSummary } from "./rss";

describe("RSS summary selection", () => {
  it("uses content:encoded when snippet and content are absent", () => {
    expect(
      selectSummary({ contentEncoded: "<p>Full <strong>article</strong> body</p>" }),
    ).toBe("Full article body");
  });

  it("skips whitespace-only fields and caps the clean text", () => {
    expect(selectSummary({ contentSnippet: "  ", contentEncoded: "<p>abcdef</p>" }, 5)).toBe("abcd…");
  });

  it("keeps an oversized requested summary within the pipeline limit", () => {
    expect(selectSummary({ contentSnippet: "x".repeat(2_000) }, 10_000)).toHaveLength(600);
  });
});
