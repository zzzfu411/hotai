import { describe, expect, it } from "vitest";
import { failureTransition, retryDelayMs } from "./enrich.js";

describe("AI enrichment retry backoff", () => {
  it("starts at five minutes and doubles per attempt", () => {
    expect(retryDelayMs(1)).toBe(5 * 60 * 1000);
    expect(retryDelayMs(2)).toBe(10 * 60 * 1000);
    expect(retryDelayMs(3)).toBe(20 * 60 * 1000);
  });

  it("caps retry delay at 24 hours", () => {
    expect(retryDelayMs(20)).toBe(24 * 60 * 60 * 1000);
  });

  it("schedules attempts below the cap and terminalizes the sixth", () => {
    const retry = failureTransition(5, 1_000);
    expect(retry.status).toBe("retry");
    expect(retry.nextAttemptAt?.getTime()).toBe(1_000 + 80 * 60 * 1000);

    expect(failureTransition(6, 1_000)).toEqual({
      status: "failed",
      nextAttemptAt: null,
    });
  });
});
