import { describe, expect, it } from "vitest";
import { readJsonLines } from "./json-lines";

describe("readJsonLines", () => {
  it("decodes JSON split across arbitrary chunks and a final unterminated line", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"source":{"id":"a"'));
        controller.enqueue(encoder.encode('}}\r\n\n{"done":'));
        controller.enqueue(encoder.encode("true}"));
        controller.close();
      },
    });
    const values: unknown[] = [];

    await readJsonLines(body, (value) => values.push(value));

    expect(values).toEqual([{ source: { id: "a" } }, { done: true }]);
  });

  it("ignores blank lines", async () => {
    const body = new Blob(["\n  \r\n{\"total\":2}\n"]).stream();
    const values: unknown[] = [];

    await readJsonLines(body, (value) => values.push(value));

    expect(values).toEqual([{ total: 2 }]);
  });
});
