import { describe, expect, it } from "vitest";
import { startOfUtcQuotaDay } from "./ask-quota";

describe("ask quota day", () => {
  it("normalizes usage to a UTC calendar day", () => {
    expect(startOfUtcQuotaDay(new Date("2026-08-31T23:59:59.999Z")).toISOString()).toBe(
      "2026-08-31T00:00:00.000Z",
    );
  });
});
