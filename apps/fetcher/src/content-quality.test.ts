import { describe, expect, it } from "vitest";
import { assessEnabledSources, assessSourceContent } from "./content-quality.js";

const base = { accepted: 1, discardedInvalid: 0, discardedOutsideWindow: 0, failed: 0 };

describe("assessSourceContent", () => {
  it("treats an empty adapter payload as a failure", () => {
    expect(assessSourceContent(0, base).status).toBe("failed");
  });

  it("does not auto-fail a reachable low-frequency feed whose items are old", () => {
    expect(
      assessSourceContent(4, { ...base, accepted: 0, discardedOutsideWindow: 4 }),
    ).toEqual({
      status: "degraded",
      reason: "4 item(s) outside the 14-day retention window",
    });
  });

  it("fails when the payload contains no usable item and invalid data", () => {
    expect(
      assessSourceContent(3, { ...base, accepted: 0, discardedInvalid: 3 }),
    ).toEqual({
      status: "failed",
      reason: "no usable items (3 invalid, 0 outside retention window)",
    });
  });

  it("marks partial invalid data as degraded while keeping the source reachable", () => {
    expect(assessSourceContent(5, { ...base, discardedInvalid: 2 })).toEqual({
      status: "degraded",
      reason: "2 invalid item(s) discarded",
    });
  });
});

describe("assessEnabledSources", () => {
  it("marks an empty enabled-source set as degraded", () => {
    expect(assessEnabledSources(0)).toEqual({
      status: "degraded",
      reason: "no enabled sources",
    });
    expect(assessEnabledSources(1)).toEqual({ status: "ok" });
  });
});
