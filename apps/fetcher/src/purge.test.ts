import { describe, expect, it } from "vitest";
import { coordinationLeasePurgeWhere } from "./purge.js";

describe("coordination lease retention", () => {
  it("keeps the singleton lease while bounding digest and ask history", () => {
    const now = new Date("2026-09-01T12:00:00.000Z");

    expect(coordinationLeasePurgeWhere(now)).toEqual({
      OR: [
        {
          name: { startsWith: "digest:" },
          updatedAt: { lt: new Date("2026-07-31T12:00:00.000Z") },
        },
        {
          name: { startsWith: "ask:" },
          leaseUntil: { lte: now },
          updatedAt: { lt: new Date("2026-09-01T11:00:00.000Z") },
        },
      ],
    });
  });
});
