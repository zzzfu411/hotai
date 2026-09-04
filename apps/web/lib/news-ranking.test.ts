import { describe, expect, it } from "vitest";
import {
  EDITORIAL_ITEMS_PER_SOURCE,
  editorialProgressiveLimit,
  rankHomepageItems,
  type RankableNewsItem,
} from "./news-ranking";

const NOW = Date.parse("2026-09-05T04:00:00.000Z");

function story(
  sourceId: string,
  title: string,
  hoursAgo: number,
  overrides: Partial<RankableNewsItem> = {},
): RankableNewsItem {
  const slug = encodeURIComponent(`${sourceId}-${title}`);
  return {
    sourceId,
    sourceName: sourceId,
    title,
    url: `https://example.com/${slug}`,
    summary: "A sufficiently detailed summary that gives the reader useful context about the event and why it matters.",
    publishedAt: new Date(NOW - hoursAgo * 60 * 60 * 1000).toISOString(),
    image: null,
    ...overrides,
  };
}

describe("rankHomepageItems", () => {
  it("puts consequential reporting ahead of newer shopping noise", () => {
    const major = story("gnews-top", "联合国就特大洪灾发起紧急援助呼吁", 2);
    const deal = story("theverge", "The best gadgets on sale: laptop almost $200 off", 0.1);
    const car = story("ithome", "全新豪华 SUV 官图公布，下周正式上市", 0.2);

    const ranked = rankHomepageItems([deal, car, major], { now: NOW });

    expect(ranked[0]?.url).toBe(major.url);
    expect(ranked.at(-1)?.url).toBe(deal.url);
  });

  it("collapses the same event and rewards independent corroboration", () => {
    const primary = story("gnews-top", "美国非农就业远超预期，市场重新评估加息路径", 2);
    const duplicate = story("gnews-biz", "美国非农就业远超预期 市场重新评估加息路径", 1.8);
    const unrelated = story("ithome", "某品牌签署新一轮战略合作协议", 0.2);

    const ranked = rankHomepageItems([unrelated, duplicate, primary], { now: NOW });

    expect(ranked).toHaveLength(2);
    expect(ranked[0]?.url).toBe(primary.url);
  });

  it("matches a short headline with a longer paraphrase of the same event", () => {
    const short = story("gnews-top", "三名伊朗飞行员在美军袭击中死亡 伊朗反击美军基地", 1);
    const long = story(
      "gnews-tech",
      "3名伊朗飞行员被炸死，伊朗使用导弹和无人机打击美军基地及战斗机机库",
      0.8,
    );

    expect(rankHomepageItems([long, short], { now: NOW })).toHaveLength(1);
  });

  it("prevents a high-volume feed from taking over the first page", () => {
    const noisy = Array.from({ length: 18 }, (_, index) =>
      story("ithome", `Routine device report ithome item${index + 1} marker${index + 101}`, index / 10),
    );
    const otherSources = ["gnews-top", "gnews-world", "gnews-biz", "bbc-zh", "dw-zh", "theverge"];
    const broader = otherSources.flatMap((sourceId, sourceIndex) =>
      Array.from({ length: 4 }, (_, index) =>
        story(
          sourceId,
          `Independent report ${sourceId} item${sourceIndex * 10 + index + 1} marker${sourceIndex * 10 + index + 301}`,
          1 + index,
        ),
      ),
    );

    const firstPage = rankHomepageItems([...noisy, ...broader], { now: NOW }).slice(0, 24);
    const noisyCount = firstPage.filter((item) => item.sourceId === "ithome").length;
    const distinctSources = new Set(firstPage.map((item) => item.sourceId));

    expect(noisyCount).toBeLessThanOrEqual(EDITORIAL_ITEMS_PER_SOURCE);
    expect(distinctSources.size).toBeGreaterThanOrEqual(6);
  });

  it("uses a flexible source cap when only a few sources are available", () => {
    const items = ["bbc-zh", "gnews-top"].flatMap((sourceId, sourceIndex) =>
      Array.from({ length: 20 }, (_, index) =>
        story(
          sourceId,
          `Exclusive ${sourceId} topic${sourceIndex * 100 + index} marker${sourceIndex * 100 + index + 500}`,
          index / 10,
        ),
      ),
    );

    const firstPage = rankHomepageItems(items, { now: NOW }).slice(0, 24);
    const counts = firstPage.reduce<Record<string, number>>((acc, item) => {
      acc[item.sourceId] = (acc[item.sourceId] ?? 0) + 1;
      return acc;
    }, {});

    expect(firstPage).toHaveLength(24);
    expect(counts["bbc-zh"]).toBe(12);
    expect(counts["gnews-top"]).toBe(12);
  });

  it("keeps malformed numeric entities from breaking a remote batch", () => {
    const malformed = story(
      "gnews-top",
      "最高法院发布数据隐私裁决 &#99999999;",
      1,
    );

    expect(() => rankHomepageItems([malformed], { now: NOW })).not.toThrow();
    expect(rankHomepageItems([malformed], { now: NOW })).toHaveLength(1);
  });
});

describe("editorialProgressiveLimit", () => {
  it("builds a diverse first page before extending the waterfall", () => {
    expect(editorialProgressiveLimit(0)).toBe(0);
    expect(editorialProgressiveLimit(1)).toBe(4);
    expect(editorialProgressiveLimit(3)).toBe(12);
    expect(editorialProgressiveLimit(6)).toBe(24);
    expect(editorialProgressiveLimit(7)).toBe(48);
    expect(editorialProgressiveLimit(8)).toBe(72);
  });
});
