import { describe, expect, it } from "vitest";
import { utcDayWindow } from "./digest.js";

describe("utcDayWindow", () => {
  it("returns a half-open UTC calendar-day interval", () => {
    const { start, end } = utcDayWindow(new Date("2026-08-31T23:59:59.999Z"));
    expect(start.toISOString()).toBe("2026-08-31T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
});
