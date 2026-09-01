import { describe, expect, it } from "vitest";
import { isRetainablePublishedAt } from "./retention.js";

describe("publication retention guard", () => {
  const now = Date.UTC(2026, 7, 31, 0, 0, 0);

  it("accepts dates inside the configured window", () => {
    expect(isRetainablePublishedAt(new Date(now - 13 * 86_400_000), now, 14)).toBe(true);
  });

  it("rejects replayed old items and invalid dates", () => {
    expect(isRetainablePublishedAt(new Date(now - 15 * 86_400_000), now, 14)).toBe(false);
    expect(isRetainablePublishedAt(new Date(Number.NaN), now, 14)).toBe(false);
  });

  it("allows small clock skew but rejects far-future timestamps", () => {
    expect(isRetainablePublishedAt(new Date(now + 60 * 60 * 1000), now, 14)).toBe(true);
    expect(isRetainablePublishedAt(new Date(now + 2 * 86_400_000), now, 14)).toBe(false);
  });
});
