import { describe, expect, it } from "vitest";
import {
  addSource,
  exportOpml,
  formatFeedError,
  mergeOpml,
  normalizeFeedUrl,
  parseCustomSources,
  parseOpml,
} from "./local-sources";

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<!-- 热榜 Feed 不要和实验室 RSS 挂进同一分类 -->
<opml version="2.0">
  <head>
    <title>Hot AI</title>
  </head>
  <body>
    <outline text="Media" title="Media">
      <outline type="rss" text="Hacker News" title="Hacker News" xmlUrl="https://hnrss.org/frontpage" htmlUrl="https://news.ycombinator.com/"/>
      <outline type="rss" text="HN dup" xmlUrl="https://hnrss.org/frontpage"/>
    </outline>
    <outline text="Research">
      <outline type="rss" text="arXiv cs.AI" xmlUrl="https://rss.arxiv.org/rss/cs.AI"/>
    </outline>
  </body>
</opml>`;

describe("normalizeFeedUrl", () => {
  it("accepts http(s) and prefixes bare hosts", () => {
    expect(normalizeFeedUrl("https://hnrss.org/frontpage")).toBe("https://hnrss.org/frontpage");
    expect(normalizeFeedUrl("hnrss.org/frontpage")).toBe("https://hnrss.org/frontpage");
  });

  it("rejects non-http schemes", () => {
    expect(normalizeFeedUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeFeedUrl("ftp://files.example/feed.xml")).toBeNull();
  });
});

describe("parseOpml", () => {
  it("reads nested xmlUrl outlines and skips folders / dupes", () => {
    const outlines = parseOpml(SAMPLE);
    expect(outlines).toEqual([
      { name: "Hacker News", url: "https://hnrss.org/frontpage" },
      { name: "arXiv cs.AI", url: "https://rss.arxiv.org/rss/cs.AI" },
    ]);
  });

  it("unescapes attribute entities and mixed-case xmlUrl", () => {
    const xml = `<outline XMLURL="https://ex.com/a?x=1&amp;y=2" title="A &amp; B"/>`;
    expect(parseOpml(xml)).toEqual([{ name: "A & B", url: "https://ex.com/a?x=1&y=2" }]);
  });

  it("ignores outlines without xmlUrl", () => {
    expect(parseOpml(`<outline text="folder" /><outline url="https://ex.com/rss"/>`)).toEqual([]);
  });
});

describe("exportOpml", () => {
  it("round-trips xmlUrl outlines", () => {
    const sources = [
      { id: "1", name: "HN", url: "https://hnrss.org/frontpage", enabled: true },
      { id: "2", name: "A & B", url: "https://ex.com/feed.xml", enabled: false },
    ];
    const xml = exportOpml(sources);
    expect(xml).toContain('xmlUrl="https://hnrss.org/frontpage"');
    expect(xml).toContain("A &amp; B");
    expect(parseOpml(xml)).toEqual([
      { name: "HN", url: "https://hnrss.org/frontpage" },
      { name: "A & B", url: "https://ex.com/feed.xml" },
    ]);
  });
});

describe("parseCustomSources", () => {
  it("keeps well-formed rows, defaults enabled, drops junk", () => {
    const raw = JSON.stringify([
      { id: "a", name: "HN", url: "https://hnrss.org/frontpage" },
      { id: "b", name: "X", url: "javascript:x" },
      { id: "a", name: "dup id", url: "https://ex.com/rss" },
      null,
      { url: "http://" },
    ]);
    const rows = parseCustomSources(raw);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: "a", name: "HN", url: "https://hnrss.org/frontpage", enabled: true });
    expect(rows[1]?.url).toBe("https://ex.com/rss");
    expect(rows[1]?.id).not.toBe("a");
  });
});

describe("addSource / mergeOpml", () => {
  it("adds a feed url and rejects duplicates", () => {
    const first = addSource([], "https://hnrss.org/frontpage", "HN");
    expect(first.added?.url).toBe("https://hnrss.org/frontpage");
    expect(first.added?.enabled).toBe(true);
    const dup = addSource(first.sources, "hnrss.org/frontpage");
    expect(dup.error).toBe("duplicate");
    expect(dup.sources).toHaveLength(1);
  });

  it("merges OPML without duplicating existing urls", () => {
    const { sources: start } = addSource([], "https://hnrss.org/frontpage", "HN");
    const merged = mergeOpml(start, SAMPLE);
    expect(merged.added).toBe(1);
    expect(merged.skipped).toBe(1);
    expect(merged.sources.map((s) => s.url)).toEqual([
      "https://hnrss.org/frontpage",
      "https://rss.arxiv.org/rss/cs.AI",
    ]);
  });
});

describe("formatFeedError", () => {
  it("spells out 429 with retry-after", () => {
    expect(formatFeedError({ status: 429, error: "rate limited", retryAfterSec: 12 }, "zh")).toBe(
      "请求太频繁（429）。请 12 秒后再试。",
    );
    expect(formatFeedError({ status: 429, error: "rate limited" }, "en")).toBe(
      "Rate limited (429). Try again shortly.",
    );
  });
});
