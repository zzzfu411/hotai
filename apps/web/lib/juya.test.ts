import { describe, expect, it } from "vitest";
import { issuesFromParsed, sanitizeJuyaHtml } from "./juya";

describe("juya", () => {
  it("parses dated RSS items and keeps sanitized HTML", () => {
    const issues = issuesFromParsed([
      {
        title: "2026-08-25",
        link: "https://daily.juya.uk/issues/2026-08-25/",
        isoDate: "2026-08-25T00:50:12.000Z",
        contentEncoded:
          '<h1>AI 早报 2026-08-25</h1><h2>概览</h2><p>OpenAI 学生优惠 <a href="https://openai.com">↗</a></p><script>alert(1)</script>',
      },
      {
        title: "undated junk",
        link: "https://daily.juya.uk/about/",
        contentEncoded: "<p>nope</p>",
      },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.date).toBe("2026-08-25");
    expect(issues[0]?.html).toContain("OpenAI");
    expect(issues[0]?.html).not.toContain("script");
    expect(issues[0]?.toc.some((t) => t.text === "概览")).toBe(true);
  });

  it("strips scripts in sanitizer", () => {
    const html = sanitizeJuyaHtml('<p>ok</p><script>x()</script><img src="https://assets.juya.uk/a.png">');
    expect(html).toContain("ok");
    expect(html).not.toContain("script");
    expect(html).toContain("assets.juya.uk");
  });
});
