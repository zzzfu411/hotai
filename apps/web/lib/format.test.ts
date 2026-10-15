import { describe, expect, it } from "vitest";
import { formatStamp, shortSourceName } from "./format";

describe("shortSourceName", () => {
  it("drops a trailing qualifier", () => {
    expect(shortSourceName("Hacker News (AI filter)")).toBe("Hacker News");
    expect(shortSourceName("机器之心（精选）")).toBe("机器之心");
  });

  it("keeps names without a qualifier, or that are only one", () => {
    expect(shortSourceName("r/LocalLLaMA")).toBe("r/LocalLLaMA");
    expect(shortSourceName("(untitled)")).toBe("(untitled)");
    expect(shortSourceName("GPT (4) notes from the field")).toBe("GPT (4) notes from the field");
  });
});

describe("formatStamp", () => {
  it("uses Beijing time for Chinese and UTC for English", () => {
    const d = new Date("2026-10-14T17:45:00Z");
    expect(formatStamp(d, "zh")).toBe("2026年10月15日 01:45");
    expect(formatStamp(d, "en")).toBe("14 Oct 2026, 17:45 UTC");
  });
});
