import { afterEach, describe, expect, it, vi } from "vitest";

const fetchPublic = vi.hoisted(() => vi.fn());
vi.mock("./ssrf", () => ({ fetchPublic }));

import { issuesFromParsed, loadJuyaIssues, sanitizeJuyaHtml } from "./juya";

function feed(date: string): string {
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>Juya</title><item><title>${date}</title><link>https://daily.juya.uk/issues/${date}/</link><description><![CDATA[<p>${date} 内容</p>]]></description></item></channel></rss>`;
}

const cache = globalThis as typeof globalThis & { __hotai_juya?: { at: number; issues: unknown[] } };

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
    const html = sanitizeJuyaHtml('<p style="position:fixed;inset:0">ok</p><script>x()</script><img src="https://assets.juya.uk/a.png">');
    expect(html).toContain("ok");
    expect(html).not.toContain("script");
    expect(html).not.toContain("style=");
    expect(html).toContain("assets.juya.uk");
  });

  it("ignores an invalid pubDate instead of aborting the whole feed", () => {
    const issues = issuesFromParsed([
      {
        title: "2026-08-26",
        link: "https://daily.juya.uk/issues/2026-08-26/",
        pubDate: "not-a-date",
        contentEncoded: "<p>仍然可以阅读</p>",
      },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.publishedAt).toBe("2026-08-26T00:00:00.000Z");
  });

  describe("loadJuyaIssues", () => {
    afterEach(() => {
      delete cache.__hotai_juya;
      fetchPublic.mockReset();
    });

    it("answers from an expired copy at once and refreshes behind it", async () => {
      fetchPublic.mockResolvedValueOnce({ body: feed("2026-08-25") });
      expect((await loadJuyaIssues()).map((it) => it.date)).toEqual(["2026-08-25"]);
      expect(fetchPublic).toHaveBeenCalledTimes(1);

      cache.__hotai_juya!.at -= 16 * 60 * 1000;
      let release!: () => void;
      fetchPublic.mockReturnValueOnce(
        new Promise((resolve) => {
          release = () => resolve({ body: feed("2026-08-26") });
        }),
      );
      // Stale copy now, while the refresh is still waiting on the feed.
      expect((await loadJuyaIssues()).map((it) => it.date)).toEqual(["2026-08-25"]);
      expect(fetchPublic).toHaveBeenCalledTimes(2);
      release();
      await vi.waitFor(async () => expect((await loadJuyaIssues())[0]?.date).toBe("2026-08-26"));
      expect(fetchPublic).toHaveBeenCalledTimes(2);
    });

    it("keeps the old copy when a refresh fails", async () => {
      fetchPublic.mockResolvedValueOnce({ body: feed("2026-08-25") });
      await loadJuyaIssues();
      cache.__hotai_juya!.at -= 16 * 60 * 1000;
      fetchPublic.mockRejectedValueOnce(new Error("down"));
      expect((await loadJuyaIssues())[0]?.date).toBe("2026-08-25");
      await vi.waitFor(() => expect(Date.now() - cache.__hotai_juya!.at).toBeLessThan(15 * 60 * 1000));
      expect((await loadJuyaIssues())[0]?.date).toBe("2026-08-25");
      expect(fetchPublic).toHaveBeenCalledTimes(2);
    });

    it("throws on a cold failure", async () => {
      fetchPublic.mockRejectedValueOnce(new Error("down"));
      await expect(loadJuyaIssues()).rejects.toThrow("down");
    });
  });
});
