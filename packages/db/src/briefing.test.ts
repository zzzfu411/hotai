import { describe, expect, it } from "vitest";
import { BRIEFING_SOURCE_SLUGS, BRIEFING_SOURCE_SLUG_SET, isBriefingSourceSlug } from "./briefing.js";

describe("briefing source allowlist", () => {
  it("defaults to papers and changelogs only", () => {
    expect([...BRIEFING_SOURCE_SLUGS].sort()).toEqual(
      [
        "arxiv-cs-ai",
        "arxiv-cs-lg",
        "huggingface-blog",
        "huggingface-papers",
        "juya-daily",
        "openai-blog",
      ].sort(),
    );
    expect(BRIEFING_SOURCE_SLUGS).toHaveLength(6);
  });

  it("keeps HN, portals, and extra lab blogs off the default corpus", () => {
    for (const slug of [
      "hn-frontpage",
      "reddit-ml",
      "reddit-localllama",
      "github-trending",
      "huggingface-trending",
      "jiqizhixin",
      "qbitai",
      "theverge-ai",
      "arstechnica-ai",
      "36kr-ai",
      "infoq-cn-ai",
      "anthropic-news",
      "google-research",
      "deepmind-blog",
      "meta-ai",
      "arxiv-cs-cl",
    ]) {
      expect(BRIEFING_SOURCE_SLUG_SET.has(slug)).toBe(false);
      expect(isBriefingSourceSlug(slug)).toBe(false);
    }
  });
});
