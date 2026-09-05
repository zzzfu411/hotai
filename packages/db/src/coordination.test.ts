import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ updateMany: vi.fn() }));
vi.mock("./client.js", () => ({ prisma: { coordinationLease: { updateMany: mocks.updateMany } } }));
import { startCoordinationHeartbeat } from "./coordination.js";
describe("long-running coordination heartbeat", () => {
  afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });
  it("renews throughout work and stops its timer after completion", async () => {
    vi.useFakeTimers();
    mocks.updateMany.mockResolvedValue({ count: 1 });
    const heartbeat = startCoordinationHeartbeat({ name: "digest:test", ownerId: "a" }, 120_000);
    await vi.advanceTimersByTimeAsync(90_000);
    expect(mocks.updateMany).toHaveBeenCalledTimes(3);
    expect(await heartbeat.stop()).toBe(true);
    await vi.advanceTimersByTimeAsync(90_000);
    expect(mocks.updateMany).toHaveBeenCalledTimes(3);
  });
  it("reports lost ownership and cannot keep renewing a successor's lease", async () => {
    vi.useFakeTimers();
    mocks.updateMany.mockResolvedValue({ count: 0 });
    const heartbeat = startCoordinationHeartbeat({ name: "digest:test", ownerId: "old" }, 120_000);
    await vi.advanceTimersByTimeAsync(90_000);
    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
    expect(await heartbeat.stop()).toBe(false);
  });
});
