import { describe, expect, it } from "vitest";
import { sanitizeRemoteHtml, sanitizeRemoteHtmlBatch } from "./sanitize-remote-html";

describe("remote HTML sanitization", () => {
  it("normalizes public URLs and removes active/private resource sinks", async () => {
    const html = await sanitizeRemoteHtml(
      '<p style="position:fixed"><a href="/story" target="_blank">story</a>' +
        '<img src="http://192.168.1.1/reboot" srcset="https://cdn.example/a 2x">' +
        '<script>alert(1)</script></p>',
      "https://news.example/posts/1",
    );
    expect(html).not.toContain("style=");
    expect(html).not.toContain("script");
    expect(html).not.toContain("192.168.1.1");
    expect(html).not.toContain("srcset");
    expect(html).toContain('href="https://news.example/story"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("drops remote classes so they cannot pick up site styles", async () => {
    const html = await sanitizeRemoteHtml(
      '<div class="kz-juya-lightbox"><p class="sr-only" id="s1">text</p></div>',
      "https://news.example/",
    );
    expect(html).not.toContain("class=");
    expect(html).toContain('id="s1"');
  });

  it("sanitizes a batch in order in one worker round trip", async () => {
    const out = await sanitizeRemoteHtmlBatch(
      ['<p onclick="x()">one</p>', "<script>alert(1)</script>", '<a href="/two">two</a>'],
      "https://news.example/",
    );
    expect(out).toEqual(["<p>one</p>", "", '<a href="https://news.example/two">two</a>']);
    expect(await sanitizeRemoteHtmlBatch([], "https://news.example/")).toEqual([]);
  });
});
