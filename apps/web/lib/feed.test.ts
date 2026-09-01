import { describe, expect, it } from "vitest";
import { feedContentHtml, parseFeedQuery, pickFeedSummary } from "./feed";

const row = {
  summary: "raw blurb",
  aiSummaryEn: "English AI summary",
  aiSummaryZh: "中文摘要",
  aiTopics: ["agents", "llm"],
  aiImportance: 0.91,
};

describe("pickFeedSummary", () => {
  it("defaults to zh then en then raw", () => {
    expect(pickFeedSummary(row)).toBe("中文摘要");
    expect(pickFeedSummary({ ...row, aiSummaryZh: null })).toBe("English AI summary");
    expect(pickFeedSummary({ ...row, aiSummaryZh: null, aiSummaryEn: null })).toBe("raw blurb");
  });

  it("honours lang=", () => {
    expect(pickFeedSummary(row, "en")).toBe("English AI summary");
    expect(pickFeedSummary(row, "zh")).toBe("中文摘要");
  });
});

describe("parseFeedQuery", () => {
  it("reads category, min_importance, lang", () => {
    const q = parseFeedQuery(
      new URLSearchParams("category=research&min_importance=0.8&lang=en"),
    );
    expect(q).toEqual({ category: "research", minImportance: 0.8, lang: "en" });
  });

  it("ignores unknown category / lang", () => {
    const q = parseFeedQuery(new URLSearchParams("category=sports&lang=fr"));
    expect(q.category).toBeUndefined();
    expect(q.lang).toBeUndefined();
  });

  it("ignores an out-of-range importance threshold", () => {
    expect(parseFeedQuery(new URLSearchParams("min_importance=2")).minImportance).toBeUndefined();
    expect(parseFeedQuery(new URLSearchParams("min_importance=-0.1")).minImportance).toBeUndefined();
  });
});

describe("feedContentHtml", () => {
  it("includes summary, topics, importance", () => {
    const html = feedContentHtml(row);
    expect(html).toContain("中文摘要");
    expect(html).toContain("主题：agents, llm");
    expect(html).toContain("重要度：0.91");
  });
});
