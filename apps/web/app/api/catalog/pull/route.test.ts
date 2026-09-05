import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ limit: vi.fn(), feed: vi.fn(), snapshot: vi.fn(), articles: vi.fn() }));
vi.mock("@/lib/ip-rate-limit", () => ({ limitIp: mock.limit }));
vi.mock("@/lib/feed-cache", () => ({ loadRemoteFeed: mock.feed, readableFeedSnapshot: mock.snapshot }));
vi.mock("@/lib/queries", () => ({ getFeedArticles: mock.articles }));
import { POST } from "./route";
const request = (ids = ["hn"], stream = false) => new Request("http://localhost/api/catalog/pull", { method: "POST", body: JSON.stringify({ ids, stream }) });
describe("catalog failure boundaries", () => {
  beforeEach(() => { vi.resetAllMocks(); });
  it("fails closed when the limiter is unavailable and no snapshot exists", async () => {
    mock.limit.mockResolvedValue({ ok: false, reason: "unavailable" });
    expect((await POST(request())).status).toBe(503);
    expect(mock.feed).not.toHaveBeenCalled();
  });
  it("serves a bounded snapshot with degraded metadata without network work", async () => {
    mock.limit.mockResolvedValue({ ok: false, reason: "unavailable" });
    mock.snapshot.mockReturnValue({ feed: { title: "Cached", items: [{ title: "Story", url: "https://example.com/story", summary: "", publishedAt: null, image: null }] }, fetchedAt: new Date().toISOString(), stale: false });
    const result = await POST(request(["hn"], true));
    const events = (await result.text()).trim().split("\n").map(line => JSON.parse(line));
    expect(result.status).toBe(200);
    expect(events.find(e => e.source)?.source.stale).toBe(true);
    expect(events.at(-1)).toMatchObject({ done: true, degraded: "service" });
    expect(mock.feed).not.toHaveBeenCalled();
  });
  it("emits the internal article ID alongside the original URL", async () => {
    mock.limit.mockResolvedValue({ ok: true });
    mock.articles.mockResolvedValue([{ id: 7, title: "Story", url: "https://example.com/original", summary: "Summary", publishedAt: new Date() }]);
    const body = await (await POST(request(["hotai-feed"]))).json();
    expect(body.sources[0].items[0]).toMatchObject({ articleId: 7, url: "https://example.com/original" });
    expect(mock.feed).not.toHaveBeenCalled();
  });
});
