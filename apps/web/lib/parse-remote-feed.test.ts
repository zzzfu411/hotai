import { describe, expect, it } from "vitest";
import { parseRemoteFeed } from "./parse-remote-feed";

describe("parseRemoteFeed", () => {
  it("parses JSON Feed 1.1", async () => {
    const body = JSON.stringify({
      version: "https://jsonfeed.org/version/1.1",
      title: "Demo",
      items: [
        {
          id: "https://ex.com/a/1",
          url: "https://hotai.example/a/1",
          external_url: "https://ex.com/post",
          title: "Hello",
          summary: "A <b>sum</b>",
          date_published: "2026-08-23T12:00:00Z",
        },
      ],
    });
    const feed = await parseRemoteFeed(body, "application/feed+json", "https://hotai.example/feed.json");
    expect(feed?.title).toBe("Demo");
    expect(feed?.items).toHaveLength(1);
    expect(feed?.items[0]?.title).toBe("Hello");
    expect(feed?.items[0]?.url).toBe("https://hotai.example/a/1");
    expect(feed?.items[0]?.summary).toBe("A sum");
    expect(feed?.items[0]?.publishedAt).toBe("2026-08-23T12:00:00.000Z");
    expect(feed?.items[0]?.image).toBeNull();
  });

  it("drops unsafe item protocols instead of returning clickable URLs", async () => {
    const feed = await parseRemoteFeed(
      JSON.stringify({
        title: "Unsafe",
        items: [
          { title: "JS", url: "javascript:alert(1)" },
          { title: "Data", url: "data:text/html,boom" },
          { title: "Good", url: "https://example.com/good" },
        ],
      }),
      "application/json",
      "https://example.com/feed.json",
    );
    expect(feed?.items.map((item) => item.title)).toEqual(["Good"]);
  });

  it("picks JSON Feed and RSS images", async () => {
    const json = await parseRemoteFeed(
      JSON.stringify({
        title: "Pics",
        items: [
          {
            title: "Cover",
            url: "https://ex.com/a",
            image: "https://ex.com/hero.jpg",
          },
        ],
      }),
      "application/json",
      "https://ex.com/",
    );
    expect(json?.items[0]?.image).toBe("https://ex.com/hero.jpg");

    const rss = await parseRemoteFeed(
      `<?xml version="1.0"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Lab</title>
    <item>
      <title>Shot</title>
      <link>https://ex.com/p</link>
      <enclosure url="https://ex.com/pic.png" type="image/png" />
    </item>
  </channel>
</rss>`,
      "application/rss+xml",
      "https://ex.com/rss",
    );
    expect(rss?.items[0]?.image).toBe("https://ex.com/pic.png");
  });

  it("rejects private enclosure and media image URLs", async () => {
    const feed = await parseRemoteFeed(
      `<?xml version="1.0"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel><title>Unsafe images</title>
    <item>
      <title>Enclosure</title><link>https://example.com/a</link>
      <enclosure url="http://127.0.0.1:8000/admin" type="image/png" />
      <media:content url="http://192.168.1.1/router.png" type="image/png" />
      <media:thumbnail url="http://[::1]/loop.png" />
    </item>
  </channel>
</rss>`,
      "application/rss+xml",
      "https://example.com/rss",
    );
    expect(feed?.items[0]?.image).toBeNull();
  });

  it("parses RSS 2.0", async () => {
    const body = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Lab</title>
    <item>
      <title>Paper</title>
      <link>https://arxiv.org/abs/1</link>
      <pubDate>Sat, 23 Aug 2026 12:00:00 GMT</pubDate>
      <description>An abstract.</description>
    </item>
  </channel>
</rss>`;
    const feed = await parseRemoteFeed(body, "application/rss+xml", "https://example.com/rss");
    expect(feed?.title).toBe("Lab");
    expect(feed?.items[0]?.title).toBe("Paper");
    expect(feed?.items[0]?.url).toBe("https://arxiv.org/abs/1");
    expect(feed?.items[0]?.summary).toContain("abstract");
  });

  it("honors maxItems and summaryLen", async () => {
    const body = JSON.stringify({
      title: "Many",
      items: Array.from({ length: 12 }, (_, i) => ({
        title: `T${i}`,
        url: `https://ex.com/${i}`,
        summary: "x".repeat(80),
      })),
    });
    const feed = await parseRemoteFeed(body, "application/json", "https://ex.com/", {
      maxItems: 3,
      summaryLen: 20,
    });
    expect(feed?.items).toHaveLength(3);
    expect(feed?.items[0]?.summary.length).toBeLessThanOrEqual(20);
  });

  it("caps at 80 items", async () => {
    const items = Array.from({ length: 100 }, (_, i) => ({
      title: `T${i}`,
      url: `https://ex.com/${i}`,
    }));
    const feed = await parseRemoteFeed(
      JSON.stringify({ title: "Big", items }),
      "application/json",
      "https://ex.com/",
    );
    expect(feed?.items).toHaveLength(80);
  });
});
