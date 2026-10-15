import { describe, expect, it } from "vitest";
import { parseArticleId, parseCrossPosts, topTopics } from "./article";

describe("parseArticleId", () => {
  it("accepts positive integers", () => {
    expect(parseArticleId("1")).toBe(1);
    expect(parseArticleId("42")).toBe(42);
    expect(parseArticleId("2147483647")).toBe(2147483647);
  });

  it("rejects junk", () => {
    expect(parseArticleId("")).toBeNull();
    expect(parseArticleId("0")).toBeNull();
    expect(parseArticleId("-1")).toBeNull();
    expect(parseArticleId("01")).toBeNull();
    expect(parseArticleId("1.5")).toBeNull();
    expect(parseArticleId("1abc")).toBeNull();
    expect(parseArticleId("2147483648")).toBeNull();
  });
});

describe("parseCrossPosts", () => {
  it("keeps well-formed entries", () => {
    expect(
      parseCrossPosts([
        { source: "hn", url: "https://news.ycombinator.com/item?id=1", publishedAt: "2026-01-01T00:00:00Z" },
        { source: "  ", url: "https://x.example" },
        { nope: true },
        null,
      ]),
    ).toEqual([
      {
        source: "hn",
        url: "https://news.ycombinator.com/item?id=1",
        publishedAt: "2026-01-01T00:00:00Z",
      },
    ]);
  });

  it("returns empty on non-arrays", () => {
    expect(parseCrossPosts(null)).toEqual([]);
    expect(parseCrossPosts({ source: "hn" })).toEqual([]);
  });
});

describe("topTopics", () => {
  it("counts each story once and keeps topics shared by two or more", () => {
    const cards = [
      { aiTopics: ["agents", "openai", "agents"] },
      { aiTopics: ["agents", "chips"] },
      { aiTopics: ["openai", " "] },
      { aiTopics: undefined },
      { aiTopics: ["chips", "agents"] },
    ];
    expect(topTopics(cards)).toEqual([
      { name: "agents", count: 3 },
      { name: "chips", count: 2 },
      { name: "openai", count: 2 },
    ]);
    expect(topTopics(cards, 1)).toEqual([{ name: "agents", count: 3 }]);
  });
});
