import { describe, expect, it } from "vitest";
import { computeScore, type ScoringConfig } from "./scoring.js";

const cfg: ScoringConfig = {
  halfLifeHours: 24,
  keywords: ["gpt", "claude"],
  aiImportanceWeight: 2.0,
};
const NOW = new Date("2026-07-12T12:00:00Z");

function score(overrides: Partial<Parameters<typeof computeScore>[0]> = {}) {
  return computeScore(
    {
      sourceWeight: 1.0,
      publishedAt: NOW,
      title: "a quiet day in tech",
      now: NOW,
      ...overrides,
    },
    cfg,
  );
}

describe("computeScore", () => {
  it("fresh article with no boosts = weight + weight*0.1", () => {
    expect(score()).toBeCloseTo(1.1, 6);
  });

  it("halves the decayed part after one half-life", () => {
    const aged = score({ publishedAt: new Date(NOW.getTime() - 24 * 3600 * 1000) });
    expect(aged).toBeCloseTo(1.0 * 0.5 + 0.1, 6);
  });

  it("keyword hits add 0.4 each (case-insensitive, matches title+summary)", () => {
    expect(score({ title: "GPT-5 has landed" })).toBeCloseTo(1.5, 6);
    expect(score({ title: "boring", summary: "benchmark of Claude and GPT" })).toBeCloseTo(1.9, 6);
  });

  it("keyword boost caps at 2.0", () => {
    const wide: ScoringConfig = { ...cfg, keywords: ["a1", "b2", "c3", "d4", "e5", "f6"] };
    const s = computeScore(
      { sourceWeight: 1, publishedAt: NOW, title: "a1 b2 c3 d4 e5 f6", now: NOW },
      wide,
    );
    expect(s).toBeCloseTo((1 + 2.0) * 1 + 0.1, 6);
  });

  it("signals are log-compressed", () => {
    const s = score({ signals: { points: 100 } });
    expect(s).toBeCloseTo(1 + Math.log1p(100) + 0.1, 6);
    // monotonic but sublinear
    const s10x = score({ signals: { points: 1000 } });
    expect(s10x).toBeGreaterThan(s);
    expect(s10x - s).toBeLessThan(s - score());
  });

  it("weights signal kinds (comments 0.5, stars 0.8, downloads 0.01 capped)", () => {
    const s = score({ signals: { comments: 10, stars: 10, downloads: 500_000 } });
    const expected = 1 + Math.log1p(10 * 0.5 + 10 * 0.8 + 100_000 * 0.01) + 0.1;
    expect(s).toBeCloseTo(expected, 6);
  });

  it("aiImportance feeds the formula with the configured weight", () => {
    const withImportance = score({ aiImportance: 0.9 });
    expect(withImportance - score()).toBeCloseTo(0.9 * 2.0, 6);
  });

  it("treats missing aiImportance as 0 and clamps out-of-range values", () => {
    expect(score({ aiImportance: null })).toBeCloseTo(score(), 6);
    expect(score({ aiImportance: 5 })).toBeCloseTo(score({ aiImportance: 1 }), 6);
    expect(score({ aiImportance: -3 })).toBeCloseTo(score(), 6);
    expect(score({ aiImportance: Number.NaN })).toBeCloseTo(score(), 6);
  });

  it("importance decays with age like every other boost", () => {
    const dayOld = new Date(NOW.getTime() - 24 * 3600 * 1000);
    const aged = score({ publishedAt: dayOld, aiImportance: 1 });
    expect(aged).toBeCloseTo((1 + 2.0) * 0.5 + 0.1, 6);
  });
});
