import { describe, expect, it } from "vitest";
import { parseIdArray } from "./reading-flags";

describe("parseIdArray", () => {
  it("reads unique positive ints, dropping junk", () => {
    expect(parseIdArray(null)).toEqual([]);
    expect(parseIdArray("nope")).toEqual([]);
    expect(parseIdArray("[1, 1, 0, -3, \"2\", \"x\", 4.2]")).toEqual([1, 2]);
  });
});
