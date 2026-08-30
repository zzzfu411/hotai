import { describe, expect, it } from "vitest";
import { addId, parseIdArray, removeId } from "./reading-flags";

describe("parseIdArray", () => {
  it("reads unique positive ints, dropping junk", () => {
    expect(parseIdArray(null)).toEqual([]);
    expect(parseIdArray("nope")).toEqual([]);
    expect(parseIdArray("[1, 1, 0, -3, \"2\", \"x\", 4.2]")).toEqual([1, 2]);
  });
});

describe("addId / removeId", () => {
  it("moves an existing id to the end and caps from the front", () => {
    expect(addId([1, 2, 3], 2, 10)).toEqual([1, 3, 2]);
    expect(addId([1, 2, 3], 4, 3)).toEqual([2, 3, 4]);
  });

  it("removes by value", () => {
    expect(removeId([1, 2, 3], 2)).toEqual([1, 3]);
  });
});
