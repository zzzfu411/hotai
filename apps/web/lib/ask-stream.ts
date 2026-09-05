/** Bounded SSE decoder: an EOF is only successful after an explicit done event. */
export async function consumeAskStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: Record<string, unknown>) => void,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedDone = false;
  const consumeFrame = (frame: string) => {
    const data = frame.split("\n").filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart()).join("\n");
    if (!data) return;
    const event: unknown = JSON.parse(data);
    if (!event || typeof event !== "object" || Array.isArray(event)) throw new Error("Invalid answer event");
    const obj = event as Record<string, unknown>;
    if (typeof obj.error === "string") throw new Error(obj.error);
    onEvent(obj);
    receivedDone = obj.done === true;
  };
  try {
    while (!receivedDone) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");
      if (buffer.length > 128_000) throw new Error("Answer event too large");
      let boundary: number;
      while (!receivedDone && (boundary = buffer.indexOf("\n\n")) >= 0) {
        consumeFrame(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
      }
      if (done) {
        if (!receivedDone && buffer.trim()) consumeFrame(buffer);
        if (!receivedDone) throw new Error("incomplete-answer");
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
