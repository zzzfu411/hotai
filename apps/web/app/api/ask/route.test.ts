import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ corpus: vi.fn(), cache: vi.fn(), claim: vi.fn(), quota: vi.fn(), client: vi.fn() }));
vi.mock("@hotai/ai", () => ({ AI_ENABLED: true, AI_MODELS: { fast: "test" }, client: mock.client, systemBlock: (s: string) => s }));
vi.mock("@hotai/db", () => ({ acquireCoordinationLease: mock.claim, finishCoordinationLease: vi.fn(), renewCoordinationLease: vi.fn(), withCoordinationLease: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { askCache: { findUnique: mock.cache, update: vi.fn().mockResolvedValue({}) } } }));
vi.mock("@/lib/queries", () => ({ getAskCorpus: mock.corpus }));
vi.mock("@/lib/ask-quota", () => ({ reserveAskQuota: mock.quota, settleAskQuota: vi.fn() }));
import { POST } from "./route";
const request = () => new Request("http://localhost/api/ask", { method: "POST", headers: { "x-real-ip": "192.0.2.221" }, body: JSON.stringify({ question: "today?" }) });
describe("Ask grounding before model cost", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("returns a complete empty-corpus answer without reserving or calling a model", async () => {
    mock.corpus.mockResolvedValue([]);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"done":true');
    expect(mock.claim).not.toHaveBeenCalled();
    expect(mock.quota).not.toHaveBeenCalled();
    expect(mock.client).not.toHaveBeenCalled();
  });
  it("returns a retryable corpus failure before a model reservation", async () => {
    mock.corpus.mockRejectedValue(new Error("database unavailable"));
    expect((await POST(request())).status).toBe(503);
    expect(mock.quota).not.toHaveBeenCalled();
    expect(mock.client).not.toHaveBeenCalled();
  });
  it("uses a different cache key after article text changes", async () => {
    const article = { id: 3, title: "Today", url: "https://example.com/today", summary: "Version one", aiSummaryEn: null, source: { name: "Test" } };
    mock.corpus.mockResolvedValue([article]);
    mock.cache.mockResolvedValue({ hash: "test", answer: "Cached", createdAt: new Date(), sources: [] });
    await POST(request());
    const first = mock.cache.mock.calls.at(-1)![0].where.hash;
    mock.corpus.mockResolvedValue([{ ...article, summary: "Version two" }]);
    await POST(request());
    expect(mock.cache.mock.calls.at(-1)![0].where.hash).not.toBe(first);
    expect(mock.client).not.toHaveBeenCalled();
  });
});
