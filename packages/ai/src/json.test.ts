import { describe, expect, it } from "vitest";
import { extractFirstJson, parseJson } from "./json.js";

describe("parseJson", () => {
  it("parses clean JSON", () => {
    expect(parseJson('{"a":1}')).toEqual({ a: 1 });
    expect(parseJson(' [1,2,3] ')).toEqual([1, 2, 3]);
  });

  it("parses fenced JSON", () => {
    expect(parseJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(parseJson('```\n[{"a":1}]\n```')).toEqual([{ a: 1 }]);
  });

  it("parses JSON with prose before and after", () => {
    expect(parseJson('Sure! Here you go: {"a": 1} — hope that helps.')).toEqual({ a: 1 });
  });

  it("returns the full array, not the first object inside it", () => {
    const out = parseJson<unknown[]>('Results: [{"i":1},{"i":2},{"i":3}] done.');
    expect(out).toHaveLength(3);
  });

  it("survives brackets inside string values", () => {
    expect(parseJson('{"code": "if (a[0]) { return \\"}\\"; }"}')).toEqual({
      code: 'if (a[0]) { return "}"; }',
    });
  });

  it("throws when there is no JSON at all", () => {
    expect(() => parseJson("no structured data here")).toThrow();
    expect(() => parseJson("")).toThrow();
  });
});

describe("extractFirstJson", () => {
  it("extracts balanced nested structures", () => {
    expect(extractFirstJson('x {"a":{"b":[1,2]}} y')).toBe('{"a":{"b":[1,2]}}');
  });

  it("starts from whichever bracket comes first", () => {
    expect(extractFirstJson('noise [ {"a":1} ] tail')).toBe('[ {"a":1} ]');
  });

  it("returns null for bracketless text or unterminated JSON", () => {
    expect(extractFirstJson("plain text")).toBeNull();
    expect(extractFirstJson('{"a": 1')).toBeNull();
  });
});
