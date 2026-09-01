import { describe, expect, it } from "vitest";
import { asJsonRecord, readJsonBody } from "./request";

describe("readJsonBody", () => {
  it("parses a small streamed JSON body", async () => {
    const req = new Request("https://hotai.example/api", {
      method: "POST",
      body: JSON.stringify({ question: "hello" }),
      headers: { "content-type": "application/json" },
    });
    await expect(readJsonBody<{ question: string }>(req, 1024)).resolves.toEqual({
      ok: true,
      value: { question: "hello" },
    });
  });

  it("rejects a chunked body as soon as the stream crosses the cap", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"x":"'));
        controller.enqueue(new Uint8Array(32));
        controller.enqueue(new TextEncoder().encode('"}'));
        controller.close();
      },
    });
    const init = { method: "POST", body, duplex: "half" } as RequestInit & { duplex: "half" };
    const req = new Request("https://hotai.example/api", init);
    await expect(readJsonBody(req, 8)).resolves.toEqual({
      ok: false,
      status: 413,
      error: "request body too large",
    });
  });

  it("rejects requests without a body", async () => {
    const req = new Request("https://hotai.example/api", { method: "POST" });
    await expect(readJsonBody(req, 1024)).resolves.toMatchObject({ ok: false, status: 400 });
  });

  it("does not treat JSON null or arrays as named-field objects", () => {
    expect(asJsonRecord(null)).toBeNull();
    expect(asJsonRecord([])).toBeNull();
    expect(asJsonRecord({ question: "ok" })).toEqual({ question: "ok" });
  });
});
