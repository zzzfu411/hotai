const MAX_LINE_LENGTH = 2 * 1024 * 1024;

function parseLine(line: string, onValue: (value: unknown) => void): void {
  if (line.length > MAX_LINE_LENGTH) throw new Error("JSON line too large");
  const trimmed = line.trim();
  if (!trimmed) return;
  onValue(JSON.parse(trimmed) as unknown);
}

/** Consume a UTF-8 JSON Lines stream without assuming network chunk boundaries. */
export async function readJsonLines(
  body: ReadableStream<Uint8Array>,
  onValue: (value: unknown) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        parseLine(buffer.slice(0, newline), onValue);
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
      }
      if (buffer.length > MAX_LINE_LENGTH) throw new Error("JSON line too large");
    }
    buffer += decoder.decode();
    parseLine(buffer, onValue);
  } finally {
    reader.releaseLock();
  }
}
