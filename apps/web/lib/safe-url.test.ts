import { describe, expect, it } from "vitest";
import { safeHttpUrl, safeShareableHttpUrl } from "./safe-url";

describe("safe browser URLs", () => {
  it("accepts public HTTP(S) and resolves relative links", () => {
    expect(safeHttpUrl("/story", "https://news.example/base")).toBe("https://news.example/story");
    expect(safeHttpUrl("https://[2606:4700:4700::1111]/")).toBe(
      "https://[2606:4700:4700::1111]/",
    );
  });

  it("rejects local/private browser targets", () => {
    expect(safeHttpUrl("http://127.0.0.1/admin")).toBeNull();
    expect(safeHttpUrl("http://192.168.1.1/")).toBeNull();
    expect(safeHttpUrl("http://router.local/")).toBeNull();
    expect(safeHttpUrl("http://[::1]/")).toBeNull();
    expect(safeHttpUrl("http://2130706433/admin")).toBeNull();
    expect(safeHttpUrl("http://[::ffff:127.0.0.1]/admin")).toBeNull();
    expect(safeHttpUrl("http://[64:ff9b::7f00:1]/admin")).toBeNull();
  });

  it("does not publish secret-bearing subscription URLs", () => {
    expect(safeShareableHttpUrl("https://feeds.example/rss?channel_id=42")).not.toBeNull();
    expect(safeShareableHttpUrl("https://feeds.example/rss?access_token=secret")).toBeNull();
    expect(safeShareableHttpUrl("https://feeds.example/rss?apiKey=secret")).toBeNull();
    expect(safeShareableHttpUrl("https://feeds.example/rss?auth[token]=secret")).toBeNull();
  });
});
