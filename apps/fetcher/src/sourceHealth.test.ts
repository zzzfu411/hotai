import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Source } from "@hotai/db";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("@hotai/db", () => ({
  prisma: { source: { update: mocks.update, updateMany: mocks.updateMany } },
}));

import { recordFetchFailure, recordFetchSuccess } from "./sourceHealth.js";

const source = { id: 7, slug: "test-source", consecutiveFails: 4 } as Source;

describe("source fetch health persistence", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });
  it("opens a timed circuit without changing manual enablement, then clears it on success", async () => {
    mocks.update.mockResolvedValue({ consecutiveFails: 5 });
    mocks.updateMany.mockResolvedValue({ count: 1 });
    await recordFetchFailure(source, new Error("timeout"));
    const args = mocks.updateMany.mock.calls[0]![0];
    expect(args.where.enabled).toBe(true);
    expect(args.data.enabled).toBeUndefined();
    expect(args.data.autoPausedUntil.getTime()).toBeGreaterThan(Date.now());
    await recordFetchSuccess(source);
    expect(mocks.update.mock.calls.at(-1)![0].data).toMatchObject({ consecutiveFails: 0, autoPausedUntil: null });
  });

  it("only reports auto-pause after the conditional write succeeds", async () => {
    mocks.update.mockResolvedValue({ consecutiveFails: 5 });
    mocks.updateMany.mockResolvedValue({ count: 1 });

    await expect(recordFetchFailure(source, new Error("upstream"))).resolves.toEqual({
      fails: 5,
      autoPaused: true,
      persisted: true,
    });
  });

  it("marks a thresholded failure unconfirmed when the pause write races or fails", async () => {
    mocks.update.mockResolvedValue({ consecutiveFails: 5 });
    mocks.updateMany.mockResolvedValue({ count: 0 });

    await expect(recordFetchFailure(source, new Error("upstream"))).resolves.toEqual({
      fails: 5,
      autoPaused: false,
      persisted: false,
    });
  });

  it("does not treat a failed pause write as fully persisted", async () => {
    mocks.update.mockResolvedValue({ consecutiveFails: 5 });
    mocks.updateMany.mockRejectedValue(new Error("database unavailable"));

    await expect(recordFetchFailure(source, new Error("upstream"))).resolves.toEqual({
      fails: 5,
      autoPaused: false,
      persisted: false,
    });
  });

  it("does not claim a autoPaused source when the health write fails", async () => {
    mocks.update.mockRejectedValue(new Error("database unavailable"));

    await expect(recordFetchFailure(source, new Error("upstream"))).resolves.toEqual({
      fails: 5,
      autoPaused: false,
      persisted: false,
    });
  });
});
