import { describe, expect, it } from "vitest";
import { envInt } from "./env";

describe("envInt", () => {
  it("falls back for unset, blank and non-numeric values", () => {
    expect(envInt(undefined, 5, 1, 60)).toBe(5);
    expect(envInt("", 5, 1, 60)).toBe(5);
    expect(envInt("  ", 5, 1, 60)).toBe(5);
    expect(envInt("soon", 5, 1, 60)).toBe(5);
  });

  it("truncates and clamps numbers", () => {
    expect(envInt("12.9", 5, 1, 60)).toBe(12);
    expect(envInt("0", 5, 1, 60)).toBe(1);
    expect(envInt("1e9", 5, 1, 60)).toBe(60);
  });
});
