import { describe, expect, it } from "vitest";
import { clientIp, estimateTokens } from "./ask-guard";

describe("clientIp", () => {
  it("prefers the trusted single-hop real-ip header", () => {
    const req = new Request("https://hotai.example/api/ask", {
      headers: {
        "x-real-ip": "203.0.113.9",
        "x-forwarded-for": "198.51.100.1, 203.0.113.9",
      },
    });
    expect(clientIp(req)).toBe("203.0.113.9");
  });

  it("uses the right-most valid forwarded address as a fallback", () => {
    const req = new Request("https://hotai.example/api/ask", {
      headers: { "x-forwarded-for": "198.51.100.1, invalid, 203.0.113.10" },
    });
    expect(clientIp(req)).toBe("203.0.113.10");
  });

  it("does not use an invalid forged header", () => {
    const req = new Request("https://hotai.example/api/ask", {
      headers: { "x-forwarded-for": "not-an-ip" },
    });
    expect(clientIp(req)).toBe("unknown");
  });

  it("uses a conservative multilingual token estimate", () => {
    expect(estimateTokens("你好世界")).toBeGreaterThanOrEqual(4);
    expect(estimateTokens("a".repeat(100))).toBe(50);
    expect(estimateTokens("😀".repeat(10))).toBeGreaterThanOrEqual(10);
  });
});
