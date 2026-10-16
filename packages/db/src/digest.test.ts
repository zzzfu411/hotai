import { describe, expect, it } from "vitest";
import { startOfUtcDay } from "./digest.js";

describe("startOfUtcDay", () => {
  it("keys the editorial day on UTC midnight", () => {
    expect(startOfUtcDay(new Date("2026-08-31T23:59:59.999Z")).toISOString()).toBe("2026-08-31T00:00:00.000Z");
    // 07:59 in Beijing is still the previous UTC day.
    expect(startOfUtcDay(new Date("2026-09-01T07:59:00+08:00")).toISOString()).toBe("2026-08-31T00:00:00.000Z");
  });
});
