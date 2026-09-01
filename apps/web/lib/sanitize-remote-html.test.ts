import { describe, expect, it } from "vitest";
import { sanitizeRemoteHtml } from "./sanitize-remote-html";

describe("remote HTML sanitization", () => {
  it("normalizes public URLs and removes active/private resource sinks", () => {
    const html = sanitizeRemoteHtml(
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
});
