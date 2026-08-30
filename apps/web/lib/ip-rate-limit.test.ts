import { describe, expect, it, beforeEach } from "vitest";
import { limitIp, resetIpRateLimit } from "./ip-rate-limit";

describe("limitIp", () => {
  beforeEach(() => resetIpRateLimit("t"));

  it("allows up to the limit then 429s until the window resets", () => {
    expect(limitIp("t", "1.1.1.1", { limit: 2, windowMs: 60_000 }).ok).toBe(true);
    expect(limitIp("t", "1.1.1.1", { limit: 2, windowMs: 60_000 }).ok).toBe(true);
    const blocked = limitIp("t", "1.1.1.1", { limit: 2, windowMs: 60_000 });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("isolates buckets by name and ip", () => {
    expect(limitIp("t", "1.1.1.1", { limit: 1 }).ok).toBe(true);
    expect(limitIp("t", "1.1.1.1", { limit: 1 }).ok).toBe(false);
    expect(limitIp("t", "8.8.8.8", { limit: 1 }).ok).toBe(true);
    expect(limitIp("other", "1.1.1.1", { limit: 1 }).ok).toBe(true);
  });
});
