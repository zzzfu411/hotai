import { describe, expect, it } from "vitest";
import {
  hashTitle,
  hashUrl,
  isSafeHttpUrl,
  normalizeSafeUrl,
  normalizeTitle,
  normalizeUrl,
} from "./dedupe.js";

describe("normalizeUrl", () => {
  it("strips tracking params but keeps meaningful ones", () => {
    expect(
      normalizeUrl("https://example.com/post?id=3&utm_source=x&utm_medium=rss&gclid=abc&ref=hn"),
    ).toBe("https://example.com/post?id=3");
  });

  it("drops the hash fragment and trailing slash", () => {
    expect(normalizeUrl("https://example.com/post/#section")).toBe("https://example.com/post");
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com/");
  });

  it("returns trimmed input for unparsable URLs", () => {
    expect(normalizeUrl("  not a url  ")).toBe("not a url");
  });

  it("rejects unsafe item URLs before persistence", () => {
    expect(normalizeSafeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeSafeUrl("data:text/html,boom")).toBeNull();
    expect(normalizeSafeUrl("https://user:pass@example.com/a")).toBeNull();
    expect(isSafeHttpUrl("https://example.com/a")).toBe(true);
  });

  describe("arxiv canonicalization", () => {
    it("strips the version suffix", () => {
      expect(normalizeUrl("https://arxiv.org/abs/2401.12345v2")).toBe(
        "https://arxiv.org/abs/2401.12345",
      );
    });

    it("maps pdf links onto abs", () => {
      expect(normalizeUrl("https://arxiv.org/pdf/2401.12345v1.pdf")).toBe(
        "https://arxiv.org/abs/2401.12345",
      );
      expect(normalizeUrl("https://arxiv.org/pdf/2401.12345")).toBe(
        "https://arxiv.org/abs/2401.12345",
      );
    });

    it("forces https and the bare arxiv.org host", () => {
      expect(normalizeUrl("http://export.arxiv.org/abs/2506.00001v1")).toBe(
        "https://arxiv.org/abs/2506.00001",
      );
    });

    it("all variants of the same paper hash identically", () => {
      const h = hashUrl("https://arxiv.org/abs/2401.12345");
      expect(hashUrl("http://arxiv.org/abs/2401.12345v3")).toBe(h);
      expect(hashUrl("https://arxiv.org/pdf/2401.12345v3.pdf")).toBe(h);
    });

    it("leaves non-paper arxiv paths alone", () => {
      expect(normalizeUrl("https://arxiv.org/list/cs.AI/recent")).toBe(
        "https://arxiv.org/list/cs.AI/recent",
      );
    });
  });
});

describe("normalizeTitle / hashTitle", () => {
  it("is case/punctuation/width-insensitive", () => {
    expect(normalizeTitle("【重磅】GPT-5 发布!")).toBe("重磅 gpt 5 发布");
    expect(hashTitle("Hello, World!")).toBe(hashTitle("hello world"));
    expect(hashTitle("ＧＰＴ－５ 发布")).toBe(hashTitle("GPT-5 发布"));
  });

  it("collapses whitespace", () => {
    expect(normalizeTitle("a   b\t c")).toBe("a b c");
  });

  it("different stories keep different hashes", () => {
    expect(hashTitle("OpenAI releases GPT-5")).not.toBe(hashTitle("Anthropic releases Claude 5"));
  });
});
