import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Source } from "@hotai/db";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("@hotai/db", () => ({
  prisma: { source: { update: mocks.update, updateMany: mocks.updateMany } },
}));

import { recordFetchFailure } from "./sourceHealth.js";

const source = { id: 7, slug: "test-source", consecutiveFails: 4 } as Source;

describe("source fetch health persistence", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("only reports auto-disable after the conditional write succeeds", async () => {
    mocks.update.mockResolvedValue({ consecutiveFails: 5 });
    mocks.updateMany.mockResolvedValue({ count: 1 });

    await expect(recordFetchFailure(source, new Error("upstream"))).resolves.toEqual({
      fails: 5,
      disabled: true,
      persisted: true,
    });
  });

  it("marks a thresholded failure unconfirmed when the disable write races or fails", async () => {
    mocks.update.mockResolvedValue({ consecutiveFails: 5 });
    mocks.updateMany.mockResolvedValue({ count: 0 });

    await expect(recordFetchFailure(source, new Error("upstream"))).resolves.toEqual({
      fails: 5,
      disabled: false,
      persisted: false,
    });
  });

  it("does not treat a failed disable write as fully persisted", async () => {
    mocks.update.mockResolvedValue({ consecutiveFails: 5 });
    mocks.updateMany.mockRejectedValue(new Error("database unavailable"));

    await expect(recordFetchFailure(source, new Error("upstream"))).resolves.toEqual({
      fails: 5,
      disabled: false,
      persisted: false,
    });
  });

  it("does not claim a disabled source when the health write fails", async () => {
    mocks.update.mockRejectedValue(new Error("database unavailable"));

    await expect(recordFetchFailure(source, new Error("upstream"))).resolves.toEqual({
      fails: 5,
      disabled: false,
      persisted: false,
    });
  });
});
