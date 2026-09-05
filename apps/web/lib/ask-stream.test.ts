import { describe, it, expect } from "vitest";
import { consumeAskStream } from "./ask-stream";

const stream = (...chunks: string[]) => new ReadableStream<Uint8Array>({ start(c) {
  for (const text of chunks) c.enqueue(new TextEncoder().encode(text));
  c.close();
} });
describe("answer stream completion", () => {
  it("handles split CRLF frames and a final done without a newline", async () => {
    const events: unknown[] = [];
    await consumeAskStream(stream('data: {"delta":"中"}\r', '\n\r\ndata: {"done":true}'), e => events.push(e));
    expect(events).toEqual([{ delta: "中" }, { done: true }]);
  });
  it("retains partial text but reports an incomplete EOF", async () => {
    const events: unknown[] = [];
    await expect(consumeAskStream(stream('data: {"delta":"partial"}\n\n'), e => events.push(e))).rejects.toThrow("incomplete-answer");
    expect(events).toHaveLength(1);
  });
  it("does not mask provider errors or malformed JSON with done", async () => {
    await expect(consumeAskStream(stream('data: {"error":"failed"}\n\ndata: {"done":true}\n\n'), () => {})).rejects.toThrow("failed");
    await expect(consumeAskStream(stream('data: ???\n\n'), () => {})).rejects.toThrow();
  });
});
