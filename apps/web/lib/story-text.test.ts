import { describe, expect, it } from "vitest";
import { cleanSummary, displayStory } from "./story-text";

describe("cleanSummary", () => {
  it("drops Hacker News link/points footers", () => {
    expect(cleanSummary("Article URL: https://github.com/x/y Comments URL: https://news.ycombinator.com/item?id=1 Points: 335 # Comments: 169")).toBe("");
    expect(cleanSummary("https://x.com/a/status/1 Comments URL: https://news.ycombinator.com/item?id=2 Points: 413 # Comments: 364")).toBe("");
  });

  it("keeps real text that precedes an HN footer", () => {
    expect(cleanSummary("We built a tiny compiler. Comments URL: https://news.ycombinator.com/item?id=3 Points: 12 # Comments: 4"))
      .toBe("We built a tiny compiler.");
  });

  it("leaves ordinary prose containing 'Points:' alone", () => {
    expect(cleanSummary("Key Points: 3 lessons from the launch")).toBe("Key Points: 3 lessons from the launch");
  });

  it("hides summaries that only repeat the title", () => {
    expect(cleanSummary("vercel-labs/skills", "vercel-labs/skills")).toBe("");
    expect(cleanSummary("  ", "x")).toBe("");
    expect(cleanSummary(null)).toBe("");
    expect(cleanSummary("…")).toBe("");
    expect(cleanSummary("...")).toBe("");
  });
});

describe("displayStory", () => {
  it("splits the Google News publisher suffix and drops the headline digest", () => {
    expect(displayStory({ sourceId: "gnews-top", title: "胡塞武装发撤离警告 - 第一财经", summary: "胡塞武装发撤离警告 第一财经 美国考虑…" }))
      .toEqual({ title: "胡塞武装发撤离警告", summary: "", publisher: "第一财经" });
  });

  it("keeps hyphenated titles intact outside aggregators", () => {
    expect(displayStory({ sourceId: "hn", title: "Rust - a retrospective", summary: "Long read." }))
      .toEqual({ title: "Rust - a retrospective", summary: "Long read.", publisher: null });
  });

  it("does not treat a long trailing clause as a publisher", () => {
    const title = "Markets slide - investors brace for a long and difficult winter ahead of the vote";
    expect(displayStory({ sourceId: "gnews-biz", title }).publisher).toBeNull();
  });
});
